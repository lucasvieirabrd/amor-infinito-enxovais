// Diagnóstico do parser DANFE — execute com:
//   cd backend && npx ts-node src/scripts/diag-danfe.ts <caminho-do-pdf>
import * as fs from 'fs';
import * as path from 'path';

const pdfPath = process.argv[2];
if (!pdfPath) {
  console.error('Uso: npx ts-node src/scripts/diag-danfe.ts <caminho-do-pdf>');
  process.exit(1);
}

function parseBR(s: string): number {
  return parseFloat(s.trim().replace(/\./g, '').replace(',', '.')) || 0;
}

async function main() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require('pdf-parse');
  const fileBuffer = fs.readFileSync(path.resolve(pdfPath));
  const data = await pdfParse(fileBuffer);
  const text: string = data.text ?? '';

  const lines = text.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0);
  console.log(`Total de linhas não-vazias: ${lines.length}\n`);

  // ── Diagnóstico dos dois regex ─────────────────────────────────────────
  // Antigo: esperava espaços entre todos os tokens → 0 matches
  const OLD_RE = /(\d{8})\s+\S+\s+([1-7]\d{3})\s+([A-Za-zÇç]{2,4})\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s*$/;
  let oldCount = 0;
  for (const line of lines) { if (OLD_RE.test(line)) oldCount++; }
  console.log(`Regex ANTIGO (quebrado): ${oldCount} linhas`);

  // Correto: NCM(8d) + ORIG(1d) colado, SPACE, CST(2d) + CFOP(4d) + UNIT colados
  // Formato real: "841810000 006102UN1,0000..."
  const ANCHOR_RE = /(\d{8})(\d)\s+(\d{2})([1-7]\d{3})([A-Za-z]{2,3})/;
  let anchorCount = 0;
  for (const line of lines) { if (ANCHOR_RE.test(line)) anchorCount++; }
  console.log(`Regex ANCHOR corrigido: ${anchorCount} linhas\n`);

  // ── Parse completo ────────────────────────────────────────────────────
  const HEADER_SKIP_RE = /CÓDIGO|DESCRI[ÇC][ÃA]O|NCM|CST|CFOP|QTDE?|VALOR|TRIB\.|UN\.\s*COM/i;

  // Após o UNIT: QUANT tem exatamente 4 casas decimais
  const QUANT_RE = /(\d+,\d{4})/;

  // VTOTAL = primeiro valor (d,dd) que aparece repetido imediatamente a seguir
  // (VALOR TOTAL == B.CALC.ICMS na DANFE, então aparece duas vezes seguidas)
  const VTOTAL_RE = /([\d.]+,\d{2})(?=\1)/;

  interface RawItem {
    code: string; description: string; ncm: string;
    unit: string; quantity: number; unitCost: number; totalCost: number;
  }

  const rawItems: RawItem[] = [];
  let lineBuffer: string[] = [];

  console.log('── ITENS ENCONTRADOS ──────────────────────────────────────');

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

    // Reconstrói código a partir do buffer
    const prefixOnLine = line.substring(0, anchorMatch.index).trim();
    const allContext = [...lineBuffer, prefixOnLine].filter(s => s.length > 0);
    lineBuffer = [];

    // Varredura reversa: as linhas mais próximas da linha de dados são
    // descrição e código; junk do cabeçalho fica no início do buffer.
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
      } else if (foundNumeric && !isNumeric) {
        break; // chegou ao junk antes do código
      } else if (foundNumeric && isNumeric) {
        break; // código numérico muito longo = provavelmente não é código
      }
    }

    const code = codePartsRev.reverse().join('') || 'SEM_CODIGO';
    const description = descLinesRev.reverse().join(' ').trim();

    console.log(`  → code="${code}" ncm=${ncm} unit=${unit} qty=${qty} vtotal=${vtotal} | "${description.substring(0, 40)}"`);

    if (qty > 0 && vtotal > 0) {
      rawItems.push({ code, description, ncm, unit, quantity: qty, unitCost: vunit, totalCost: vtotal });
    }
  }

  // Agrega por código
  const map = new Map<string, RawItem>();
  for (const item of rawItems) {
    const ex = map.get(item.code);
    if (ex) {
      ex.quantity = parseFloat((ex.quantity + item.quantity).toFixed(4));
      ex.totalCost = parseFloat((ex.totalCost + item.totalCost).toFixed(2));
      ex.unitCost = parseFloat((ex.totalCost / ex.quantity).toFixed(4));
    } else {
      map.set(item.code, { ...item });
    }
  }

  console.log('\n── RESULTADO FINAL (agrupado) ─────────────────────────────');
  let grandTotal = 0;
  let totalUnits = 0;
  for (const [, item] of map) {
    grandTotal += item.totalCost;
    totalUnits += item.quantity;
    console.log(`  ${item.code} | ${item.description.substring(0, 45)} | ${item.quantity} un × R$${item.unitCost.toFixed(2)} = R$${item.totalCost.toFixed(2)}`);
  }
  console.log(`\n  Produtos distintos: ${map.size}`);
  console.log(`  Total de unidades : ${totalUnits}`);
  console.log(`  Soma dos totais   : R$ ${grandTotal.toFixed(2)}`);
}

main().catch(err => { console.error('ERRO:', err); process.exit(1); });
