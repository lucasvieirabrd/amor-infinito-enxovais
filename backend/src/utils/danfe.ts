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
  nfSeries: string | null;
  supplierName: string | null;
  supplierCnpj: string | null;
  recipientCnpj: string | null;
  accessKey: string | null;
  nfDate: string | null;
  totalProducts: number | null;
  items: DanfeItem[];
  validationError: string | null;
}

function parseBR(s: string): number {
  return parseFloat(s.trim().replace(/\./g, '').replace(',', '.')) || 0;
}

// ── Metadata extractors ──────────────────────────────────────────────────────

function extractAccessKey(lines: string[]): string | null {
  // "CHAVE DE ACESSO" label, then 44 digits (possibly grouped with spaces)
  for (let i = 0; i < lines.length; i++) {
    if (/CHAVE\s+(?:DE\s+)?ACESSO/i.test(lines[i])) {
      const ctx = [lines[i], lines[i + 1] ?? '', lines[i + 2] ?? ''].join(' ');
      const digits = ctx.replace(/\D/g, '');
      if (digits.length >= 44) return digits.substring(0, 44);
    }
  }
  // Fallback: any line whose digit-only content is exactly 44 chars
  for (const line of lines) {
    const digits = line.replace(/\D/g, '');
    if (digits.length === 44) return digits;
  }
  return null;
}

/** Returns [supplierCnpj, recipientCnpj] based on document order (emitente first). */
function extractCnpjs(lines: string[]): { supplierCnpj: string | null; recipientCnpj: string | null } {
  // CNPJ: 14 digits, may be formatted XX.XXX.XXX/XXXX-XX
  const CNPJ_RE = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g;
  const seen: string[] = [];

  for (const line of lines) {
    const matches = [...line.matchAll(CNPJ_RE)];
    for (const m of matches) {
      const digits = m[0].replace(/\D/g, '');
      if (digits.length === 14 && !seen.includes(digits)) seen.push(digits);
    }
  }

  return {
    supplierCnpj: seen[0] ?? null,
    recipientCnpj: seen[1] ?? null,
  };
}

function extractNfNumber(lines: string[]): string | null {
  for (const line of lines) {
    const m = line.match(/N[°º]\s*:?\s*(\d[\d.]+)|N[ÚU]MERO\s*:?\s*(\d[\d.]+)/i);
    if (m) return (m[1] || m[2]).replace(/\./g, '');
  }
  return null;
}

function extractNfSeries(lines: string[]): string | null {
  for (const line of lines) {
    const m = line.match(/S[ÉE]RIE\s*:?\s*(\d+)/i);
    if (m) return m[1];
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
  for (let i = 0; i < lines.length; i++) {
    if (/DATA\s*(?:DE\s*)?EMISS[ÃA]O/i.test(lines[i])) {
      const ctx = [lines[i], lines[i + 1] ?? ''].join(' ');
      const m = ctx.match(/(\d{2})\/(\d{2})\/(20\d{2})/);
      if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    }
  }
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

// ── Items section parser ─────────────────────────────────────────────────────

function findItemsSection(lines: string[]): { start: number; end: number } {
  const START_RE = /DADOS\s+DOS?\s+PRODUTOS?/i;
  const END_RE = /C[AÁ]LCULO\s+DO\s+IMPOSTO|TRANSPORTADOR|VOLUMES?\s*:|PESO\s+L[IÍ]QUIDO/i;
  let start = 0;
  let end = lines.length;
  let found = false;
  for (let i = 0; i < lines.length; i++) {
    if (!found && START_RE.test(lines[i])) { start = i + 1; found = true; }
    else if (found && END_RE.test(lines[i])) { end = i; break; }
  }
  return { start, end };
}

const HEADER_SKIP_RE = /CÓDIGO|DESCRI[ÇC][ÃA]O|NCM|CST|CFOP|QTDE?|VALOR|TRIB\.|UN\.\s*COM/i;

function parseItemLines(lines: string[]): DanfeItem[] {
  // Real DANFE format (tokens run together without spaces):
  //   {NCM:8d}{ORIG:1d} {CST:2d}{CFOP:4d}{UNIT:2-3 letters}{QTY}{VUNIT}{VTOTAL}...
  // Example: "841810000 006102UN1,00002.490,00000000002.490,002.490,000,000,00..."
  const ANCHOR_RE = /(\d{8})(\d)\s+(\d{2})([1-7]\d{3})([A-Za-z]{2,3})/;

  // QUANT always has exactly 4 decimal places in DANFE
  const QUANT_RE = /(\d+,\d{4})/;

  // VTOTAL == B.CALC.ICMS, so the same value appears twice consecutively.
  // Match the first occurrence of (d,dd) immediately followed by itself.
  const VTOTAL_RE = /([\d.]+,\d{2})(?=\1)/;

  const items: DanfeItem[] = [];
  let lineBuffer: string[] = [];

  for (const line of lines) {
    if (HEADER_SKIP_RE.test(line)) { lineBuffer = []; continue; }

    const anchorMatch = ANCHOR_RE.exec(line);
    if (!anchorMatch) {
      if (line.length > 2) {
        lineBuffer.push(line);
        if (lineBuffer.length > 8) lineBuffer.shift();
      }
      continue;
    }

    const ncm = anchorMatch[1];
    const unit = anchorMatch[5];
    const suffix = line.substring(anchorMatch.index + anchorMatch[0].length);

    const quantMatch = QUANT_RE.exec(suffix);
    if (!quantMatch) { lineBuffer = []; continue; }
    const qty = parseBR(quantMatch[1]);

    const afterQuant = suffix.substring(quantMatch.index + quantMatch[0].length);
    const vtotalMatch = VTOTAL_RE.exec(afterQuant);
    if (!vtotalMatch) { lineBuffer = []; continue; }
    const vtotal = parseBR(vtotalMatch[1]);
    const vunit = qty > 0 ? parseFloat((vtotal / qty).toFixed(4)) : 0;

    // Reconstruct product code using reverse scan: lines closest to the data
    // line are description then code parts; junk appears earliest in buffer.
    const prefixOnLine = line.substring(0, anchorMatch.index).trim();
    const allContext = [...lineBuffer, prefixOnLine].filter(s => s.length > 0);
    lineBuffer = [];

    const reversed = [...allContext].reverse();
    const codePartsRev: string[] = [];
    const descLinesRev: string[] = [];
    let foundNumeric = false;

    for (const part of reversed) {
      const isNumeric = /^\d+$/.test(part);
      if (!foundNumeric && !isNumeric) {
        descLinesRev.push(part);
      } else if (isNumeric && codePartsRev.join('').length + part.length <= 20) {
        codePartsRev.push(part);
        foundNumeric = true;
      } else {
        break;
      }
    }

    const code = codePartsRev.reverse().join('') || 'SEM_CODIGO';
    const description = descLinesRev.reverse().join(' ').trim();

    if (qty > 0 && vtotal > 0) {
      items.push({ code, description, ncm, unit, quantity: qty, unitCost: vunit, totalCost: vtotal });
    }
  }

  return items;
}

// ── Main exports ─────────────────────────────────────────────────────────────

export async function parseDanfePDF(buffer: Buffer): Promise<DanfeResult> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require('pdf-parse');
  const data = await pdfParse(buffer); // never swallow errors
  return parseDanfeText(data.text ?? '');
}

export function parseDanfeText(text: string): DanfeResult {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  const nfNumber = extractNfNumber(lines);
  const nfSeries = extractNfSeries(lines);
  const supplierName = extractSupplierName(lines);
  const { supplierCnpj, recipientCnpj } = extractCnpjs(lines);
  const accessKey = extractAccessKey(lines);
  const nfDate = extractNfDate(lines);
  const totalProducts = extractTotalProducts(lines);

  const { start, end } = findItemsSection(lines);
  const rawItems = parseItemLines(lines.slice(start, end));

  // Aggregate by supplier code — each physical unit may be a separate line with qty=1
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

  return { nfNumber, nfSeries, supplierName, supplierCnpj, recipientCnpj, accessKey, nfDate, totalProducts, items, validationError };
}
