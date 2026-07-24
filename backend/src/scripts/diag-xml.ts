// Diagnóstico do parser NF-e XML — execute com:
//   cd backend && npx ts-node src/scripts/diag-xml.ts <xml1> [xml2 ...]
import * as fs from 'fs';
import * as path from 'path';
import { parseNFeXML } from '../utils/danfe-xml';

const xmlPaths = process.argv.slice(2);
if (xmlPaths.length === 0) {
  console.error('Uso: npx ts-node src/scripts/diag-xml.ts <arquivo.xml> [arquivo2.xml ...]');
  process.exit(1);
}

const fmt = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

for (const xmlPath of xmlPaths) {
  const abs = path.resolve(xmlPath);
  console.log('\n' + '═'.repeat(62));
  console.log(`  ${path.basename(abs)}`);
  console.log('═'.repeat(62));

  let xmlContent: string;
  try {
    xmlContent = fs.readFileSync(abs, 'utf-8');
  } catch (e: any) {
    console.error(`  ERRO ao ler arquivo: ${e.message}`);
    continue;
  }

  const result = parseNFeXML(xmlContent);

  console.log(`  NF nº ${result.nfNumber ?? '—'} · Série ${result.nfSeries ?? '—'}`);
  console.log(`  Emissão   : ${result.nfDate ?? '—'}`);
  console.log(`  Chave     : ${result.accessKey ?? '—'}`);
  console.log(`  Emitente  : ${result.supplierName ?? '—'} [${result.supplierCnpj ?? '—'}]`);
  console.log(`  Dest CNPJ : ${result.recipientCnpj ?? '—'}`);
  console.log(`  Total NF  : ${result.totalProducts != null ? fmt(result.totalProducts) : '—'}`);

  if (result.validationError) {
    console.log(`  ⚠  ${result.validationError}`);
  }

  console.log(`\n  ── Itens agrupados (${result.items.length} distintos) ──`);
  let grandTotal = 0;
  let grandUnits = 0;
  for (const item of result.items) {
    grandTotal += item.totalCost;
    grandUnits += item.quantity;
    console.log(
      `  ${item.code.padEnd(12)} | ${item.description.substring(0, 35).padEnd(35)}` +
      ` | ${String(item.quantity).padStart(6)} ${item.unit} × ${fmt(item.unitCost).padStart(12)}` +
      ` = ${fmt(item.totalCost)}`,
    );
  }

  console.log(`\n  Produtos distintos : ${result.items.length}`);
  console.log(`  Total de unidades  : ${grandUnits}`);
  console.log(`  Soma dos totais    : ${fmt(grandTotal)}`);
}
