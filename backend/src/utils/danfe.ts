// DANFE (NF-e PDF) parser — extracts items, aggregates by product code,
// validates totals against VALOR TOTAL DOS PRODUTOS.
// NEVER silently swallows pdf-parse errors — let them propagate.

export interface DanfeItem {
  code: string;
  description: string;
  ncm: string;
  unit: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
}

export interface DanfeResult {
  nfNumber: string | null;
  supplierName: string | null;
  nfDate: string | null;
  totalProducts: number | null;
  items: DanfeItem[];
  validationError: string | null;
}

function parseBR(s: string): number {
  return parseFloat(s.trim().replace(/\./g, '').replace(',', '.')) || 0;
}

function findItemsSection(lines: string[]): { start: number; end: number } {
  const START_RE = /DADOS\s+DOS?\s+PRODUTOS?/i;
  const END_RE = /C[AÁ]LCULO\s+DO\s+IMPOSTO|TRANSPORTADOR|VOLUMES?\s*:|PESO\s+L[IÍ]QUIDO/i;

  let start = 0;
  let end = lines.length;
  let found = false;

  for (let i = 0; i < lines.length; i++) {
    if (!found && START_RE.test(lines[i])) {
      start = i + 1;
      found = true;
    } else if (found && END_RE.test(lines[i])) {
      end = i;
      break;
    }
  }

  return { start, end };
}

// Lines that are repeating column headers on multi-page DANFEs
const HEADER_SKIP_RE = /CÓDIGO|DESCRI[ÇC][ÃA]O\s+DO\s+PRODUTO|NCM.SH|C[SO]T|CFOP|QTDE?\.?\s*COM|VL\.?\s*UNIT|VALOR\s*TOTAL|UN\.\s*COM|TRIB\.\s*COM/i;

function parseItemLines(lines: string[]): DanfeItem[] {
  // Anchor pattern: NCM(8 digits) [space] CST/CSOSN(any non-space) [space]
  //                 CFOP(4 digits starting 1-7) [space] UNIT(2-4 letters) [space]
  //                 QTY VUNIT VTOTAL at end-of-line
  const DATA_RE = /(\d{8})\s+\S+\s+([1-7]\d{3})\s+([A-Za-zÇç]{2,4})\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s*$/;

  // Product code: leading alphanumeric token (4-20 chars, allows hyphens/underscores)
  const CODE_RE = /^([A-Z0-9][A-Z0-9\-_.]{3,19})\s+(.*)/is;

  const items: DanfeItem[] = [];
  let pendingLine = '';

  for (const line of lines) {
    if (HEADER_SKIP_RE.test(line)) {
      pendingLine = '';
      continue;
    }

    const m = DATA_RE.exec(line);
    if (!m) {
      // Potential code/description line — keep if non-trivial
      if (line.length > 3) pendingLine = line;
      continue;
    }

    const ncm = m[1];
    const unit = m[3];
    const qty = parseBR(m[4]);
    const vunit = parseBR(m[5]);
    const vtotal = parseBR(m[6]);

    // Combine prefix from this line with any pending line to get code+description.
    // This handles all layouts:
    //   A) all-on-one-line: prefixOnLine has code+desc, pendingLine is ''
    //   B) code+desc on prev line, data on this line: prefixOnLine is '', pendingLine has code+desc
    //   C) code on prev line, desc+data on this line: both have content → combine
    const prefixOnLine = line.substring(0, m.index).trim();
    const codeDesc = [pendingLine, prefixOnLine].filter(s => s.length > 0).join(' ').trim();
    pendingLine = '';

    const cm = CODE_RE.exec(codeDesc);
    const code = cm ? cm[1].trim() : (codeDesc.split(/\s+/)[0] || 'SEM_CODIGO');
    const description = cm ? cm[2].trim() : codeDesc.substring(code.length).trim();

    if (qty > 0 && vtotal > 0) {
      items.push({ code, description, ncm, unit, quantity: qty, unitCost: vunit, totalCost: vtotal });
    }
  }

  return items;
}

function extractNfNumber(lines: string[]): string | null {
  for (const line of lines) {
    const m = line.match(/N[°º]\s*:?\s*(\d[\d.]+)|N[ÚU]MERO\s*:?\s*(\d[\d.]+)/i);
    if (m) return (m[1] || m[2]).replace(/\./g, '');
  }
  return null;
}

function extractSupplierName(lines: string[]): string | null {
  for (let i = 0; i < lines.length; i++) {
    if (/RAZ[ÃA]O\s*SOCIAL/i.test(lines[i])) {
      const after = lines[i].replace(/RAZ[ÃA]O\s*SOCIAL\s*:?\s*/i, '').trim();
      if (after.length > 3) return after;
      if (i + 1 < lines.length) return lines[i + 1].trim();
    }
  }
  return null;
}

function extractNfDate(lines: string[]): string | null {
  // Prefer the emission date label
  for (let i = 0; i < lines.length; i++) {
    if (/DATA\s*(?:DE\s*)?EMISS[ÃA]O/i.test(lines[i])) {
      const ctx = [lines[i], lines[i + 1] ?? ''].join(' ');
      const m = ctx.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    }
  }
  // Fall back to first DD/MM/YYYY date found in recent years
  for (const line of lines) {
    const m = line.match(/(\d{2})\/(\d{2})\/(20\d{2})/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  }
  return null;
}

function extractTotalProducts(lines: string[]): number | null {
  for (let i = 0; i < lines.length; i++) {
    if (/VALOR\s+TOTAL\s+DOS\s+PRODUTOS?/i.test(lines[i])) {
      const ctx = [lines[i], lines[i + 1] ?? ''].join(' ');
      const nums = ctx.match(/([\d.]+,\d{2})/g);
      if (nums) return parseBR(nums[nums.length - 1]);
    }
  }
  return null;
}

export async function parseDanfePDF(buffer: Buffer): Promise<DanfeResult> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require('pdf-parse');
  const data = await pdfParse(buffer); // errors propagate — never swallow
  return parseDanfeText(data.text ?? '');
}

export function parseDanfeText(text: string): DanfeResult {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  const nfNumber = extractNfNumber(lines);
  const supplierName = extractSupplierName(lines);
  const nfDate = extractNfDate(lines);
  const totalProducts = extractTotalProducts(lines);

  const { start, end } = findItemsSection(lines);
  const rawItems = parseItemLines(lines.slice(start, end));

  // Aggregate by supplier code (each physical unit may be a separate line with qty=1)
  const itemMap = new Map<string, DanfeItem>();
  for (const item of rawItems) {
    const existing = itemMap.get(item.code);
    if (existing) {
      existing.quantity = parseFloat((existing.quantity + item.quantity).toFixed(4));
      existing.totalCost = parseFloat((existing.totalCost + item.totalCost).toFixed(2));
      existing.unitCost = parseFloat((existing.totalCost / existing.quantity).toFixed(4));
    } else {
      itemMap.set(item.code, { ...item });
    }
  }

  const items = Array.from(itemMap.values());

  let validationError: string | null = null;
  if (totalProducts !== null && items.length > 0) {
    const parsedTotal = items.reduce((sum, i) => sum + i.totalCost, 0);
    const diff = Math.abs(parsedTotal - totalProducts);
    if (diff > 0.10) {
      validationError = `Soma dos itens (R$ ${parsedTotal.toFixed(2)}) difere do VALOR TOTAL DOS PRODUTOS (R$ ${totalProducts.toFixed(2)}) em R$ ${diff.toFixed(2)}`;
    }
  }

  return { nfNumber, supplierName, nfDate, totalProducts, items, validationError };
}
