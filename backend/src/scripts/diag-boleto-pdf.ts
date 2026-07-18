import * as fs from 'fs';
import { parseLinhaDigitavel, validateBankDV } from '../utils/boleto';

const PDF_PATH = 'C:/Users/Amor Infinito/Desktop/47401804CELITAV-64036EF_150626165234_229.pdf';

async function main() {
  const buf = fs.readFileSync(PDF_PATH);
  console.log('Tamanho do PDF:', buf.length, 'bytes');

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require('pdf-parse');
  let data: any;
  try {
    data = await pdfParse(buf, { max: 0 }); // max: 0 = todas as páginas
  } catch (err: any) {
    console.error('Erro no pdf-parse:', err?.message);
    process.exit(1);
  }

  console.log('Páginas:', data.numpages);
  console.log('Tamanho do texto:', data.text?.length ?? 0, 'chars');
  console.log('\n=== TEXTO BRUTO (início) ===');
  console.log(JSON.stringify(data.text)); // JSON.stringify mostra \n, \t etc. explicitamente
  console.log('=== TEXTO BRUTO (fim) ===\n');

  if (!data.text || data.text.trim().length === 0) {
    console.log('⚠️  TEXTO VAZIO — o PDF provavelmente não tem camada de texto (é imagem).');
    return;
  }

  // Roda cada estratégia manualmente
  const text: string = data.text;

  console.log('--- Estratégia 1: regex flexível ---');
  const bankRe = /(\d{5})[.\s]?(\d{5})\s*(\d{5})[.\s]?(\d{6})\s*(\d{5})[.\s]?(\d{6})\s*(\d)\s*(\d{14})/g;
  let m: RegExpExecArray | null;
  let found1 = false;
  while ((m = bankRe.exec(text)) !== null) {
    const d = (m[1]+m[2]+m[3]+m[4]+m[5]+m[6]+m[7]+m[8]).replace(/\D/g,'');
    console.log('  match:', m[0].slice(0,80), '→ digits:', d.length, 'DV:', validateBankDV(d));
    found1 = true;
  }
  if (!found1) console.log('  nenhum match');

  console.log('\n--- Estratégia 2: linha a linha ---');
  const lines = text.split(/\r?\n/);
  console.log('  total de linhas:', lines.length);
  lines.forEach((l, i) => {
    const d = l.replace(/\D/g, '');
    if (d.length >= 44 && d.length <= 50) {
      console.log(`  linha ${i} (${d.length} dígitos): ${JSON.stringify(l.slice(0,100))}`);
      if (d.length === 47) console.log('    DV válido?', validateBankDV(d));
    }
  });

  console.log('\n--- Resultado final das 4 estratégias ---');
  const result = parseLinhaDigitavel(text);
  console.log(JSON.stringify(result, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
