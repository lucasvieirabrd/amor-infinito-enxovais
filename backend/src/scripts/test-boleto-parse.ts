// Teste manual: confirma decodificação de linha digitável real (Bradesco)
// Executar: npx ts-node src/scripts/test-boleto-parse.ts

import { parseLinhaDigitavel, validateBankDV, fatorVencimentoToDate } from '../utils/boleto';

const LINHA = '23791.94000 90000.511429 19001.078104 4 16220000072747';

console.log('\n═══ Teste parse-boleto ═══');
console.log('Entrada:', LINHA);

const result = parseLinhaDigitavel(LINHA);

console.log('\nResultado:');
console.log('  linhaDigitavel:', result.linhaDigitavel);
console.log('  type          :', result.type);
console.log('  amount        :', result.amount, '(esperado: 727.47)');
console.log('  dueDate       :', result.dueDate, '(esperado: 2026-11-06)');
console.log('  _strategy     :', result._strategy);

const ok_amount  = result.amount  === 727.47;
const ok_date    = result.dueDate === '2026-11-06';
const ok_dv      = result.linhaDigitavel ? validateBankDV(result.linhaDigitavel) : false;

console.log('\nValidações:');
console.log('  amount OK :', ok_amount  ? '✓' : '✗ FALHOU');
console.log('  date OK   :', ok_date    ? '✓' : '✗ FALHOU');
console.log('  DV OK     :', ok_dv      ? '✓' : '✗ FALHOU');

// Também testa o fator individualmente
const fator = 1622;
const dt = fatorVencimentoToDate(fator);
console.log('\nfatorVencimentoToDate(' + fator + '):', dt?.toISOString().slice(0, 10), '(esperado: 2026-11-06)');

if (ok_amount && ok_date && ok_dv) {
  console.log('\n✅ Todos os testes passaram.\n');
  process.exit(0);
} else {
  console.log('\n❌ Algum teste falhou.\n');
  process.exit(1);
}
