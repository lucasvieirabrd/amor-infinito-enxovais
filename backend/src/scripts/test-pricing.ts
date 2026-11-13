/**
 * Teste automatizado dos 5 casos da calculadora de precificação.
 * Roda com: npx tsx src/scripts/test-pricing.ts
 */
import { calcProduct, calcFactor, DEFAULT_PARAMS } from '../utils/pricingFormulas';

const p = DEFAULT_PARAMS;
let passed = 0;
let failed = 0;

function check(label: string, got: number, expected: number, tol = 1) {
  const ok = Math.abs(got - expected) <= tol;
  if (ok) {
    console.log(`  ✅ ${label}: ${got} (esperado ${expected})`);
    passed++;
  } else {
    console.log(`  ❌ ${label}: ${got} (esperado ${expected}, diff ${(got - expected).toFixed(4)})`);
    failed++;
  }
}

function checkStr(label: string, got: string, expected: string) {
  const ok = got === expected;
  if (ok) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}\n    got:  ${got}\n    want: ${expected}`);
    failed++;
  }
}

// ─── Helpers de formatação (espelham o frontend) ──────────────────────────────

function fmtBRL(n: number): string {
  return 'R$ ' + n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function buildCreditLine(priceCredit: number, installmentValue: number, n: number): string {
  if (n < 2) return `Crediário: ${fmtBRL(priceCredit)}`;
  return `Crediário: ${fmtBRL(priceCredit)} (Entrada de ${fmtBRL(installmentValue)} + ${n - 1}× de ${fmtBRL(installmentValue)})`;
}

function buildCardLine(priceCard10x: number, cardInstallmentsCount: number): string {
  const pVal = priceCard10x / cardInstallmentsCount;
  return `Cartão ${cardInstallmentsCount}×: ${fmtBRL(priceCard10x)} (${cardInstallmentsCount}× de ${fmtBRL(pVal)})`;
}

// Nota: total_produtos=19378, total_nf=20007.79, frete=0
const fator = calcFactor(19378, 20007.79, 0);
console.log(`\nFator: ${fator.toFixed(6)} (esperado ~1.032500)`);

console.log('\n--- Caso 1: Criado Malibu (item=140, montagem=70, 10x cred, 12x cartão) ---');
const c1 = calcProduct(p, { unitCost: 140, assembly: 70, installmentsCount: 10, factor: fator });
check('custo_real', +c1.realCost.toFixed(2), 144.55);
check('priceCredit', c1.priceCredit, 549);
check('profitCredit', +c1.profitCredit.toFixed(2), 127.04, 0.5);
check('priceCash', c1.priceCash, 419);
check('priceCard1x', c1.priceCard1x, 449);
check('priceCard10x', c1.priceCard10x, 529);
check('installmentValue (cred 10×)', +c1.installmentValue.toFixed(2), 54.90, 0.01);
check('installmentValueCard (12×)', +(c1.priceCard10x / 12).toFixed(2), 44.08, 0.01);
checkStr('creditLine_c1', buildCreditLine(c1.priceCredit, c1.installmentValue, 10),
  'Crediário: R$ 549,00 (Entrada de R$ 54,90 + 9× de R$ 54,90)');
checkStr('cardLine_c1', buildCardLine(c1.priceCard10x, 12),
  'Cartão 12×: R$ 529,00 (12× de R$ 44,08)');

console.log('\n--- Caso 2: Cômoda Petrus (item=499, montagem=70, 10x cred, 12x cartão) ---');
const c2 = calcProduct(p, { unitCost: 499, assembly: 70, installmentsCount: 10, factor: fator });
check('custo_real', +c2.realCost.toFixed(2), 515.22);
check('priceCredit', c2.priceCredit, 1779);
check('profitCredit', +c2.profitCredit.toFixed(2), 453.79, 0.5);
check('priceCash', c2.priceCash, 1309);
check('priceCard1x', c2.priceCard1x, 1409);
check('priceCard10x', c2.priceCard10x, 1699);
check('installmentValue (cred 10×)', +c2.installmentValue.toFixed(2), 177.90, 0.01);
check('installmentValueCard (12×)', +(c2.priceCard10x / 12).toFixed(2), 141.58, 0.01);

console.log('\n--- Caso 3: Roupeiro Nina (item=899, montagem=70, 10x cred, 12x cartão) ---');
const c3 = calcProduct(p, { unitCost: 899, assembly: 70, installmentsCount: 10, factor: fator });
check('custo_real', +c3.realCost.toFixed(2), 928.22);
check('priceCredit', c3.priceCredit, 3139);
check('profitCredit', +c3.profitCredit.toFixed(2), 811.91, 1);
check('priceCash', c3.priceCash, 2299);
check('priceCard1x', c3.priceCard1x, 2469);
check('priceCard10x', c3.priceCard10x, 2999);
check('installmentValue (cred 10×)', +c3.installmentValue.toFixed(2), 313.90, 0.01);
check('installmentValueCard (12×)', +(c3.priceCard10x / 12).toFixed(2), 249.92, 0.01);

console.log('\n--- Caso 4: Roupeiro Alvorada (item=1450, montagem=70, 10x cred, 12x cartão) ---');
const c4 = calcProduct(p, { unitCost: 1450, assembly: 70, installmentsCount: 10, factor: fator });
check('custo_real', +c4.realCost.toFixed(2), 1497.13);
check('priceCredit', c4.priceCredit, 5019);
check('profitCredit', +c4.profitCredit.toFixed(2), 1308.96, 1);
check('priceCash', c4.priceCash, 3669);
check('priceCard1x', c4.priceCard1x, 3939);
check('priceCard10x', c4.priceCard10x, 4799);
check('installmentValue (cred 10×)', +c4.installmentValue.toFixed(2), 501.90, 0.01);
check('installmentValueCard (12×)', +(c4.priceCard10x / 12).toFixed(2), 399.92, 0.01);

console.log('\n--- Caso 5: Sem nota — Jogo de cama (item=80, montagem=0, fator=1, 12x cartão) ---');
const c5 = calcProduct(p, { unitCost: 80, assembly: 0, installmentsCount: 10, factor: 1 });
check('priceCredit', c5.priceCredit, 269);
check('priceCash', c5.priceCash, 199);
check('priceCard1x', c5.priceCard1x, 209);
check('priceCard10x', c5.priceCard10x, 259);
check('installmentValue (cred 10×)', +c5.installmentValue.toFixed(2), 26.90, 0.01);
check('installmentValueCard (12×)', +(c5.priceCard10x / 12).toFixed(2), 21.58, 0.01);
checkStr('creditLine_c5', buildCreditLine(c5.priceCredit, c5.installmentValue, 10),
  'Crediário: R$ 269,00 (Entrada de R$ 26,90 + 9× de R$ 26,90)');
checkStr('cardLine_c5', buildCardLine(c5.priceCard10x, 12),
  'Cartão 12×: R$ 259,00 (12× de R$ 21,58)');

console.log(`\n========= Resultado: ${passed} OK / ${failed} falhou =========`);
if (failed > 0) process.exit(1);
