// Extração determinística de boleto brasileiro
// Suporta: bancário (47 dígitos) e arrecadação/convênio (48 dígitos)
// Sem IA — decodificação puramente matemática da linha digitável

// ── Fator de vencimento ────────────────────────────────────────────────────────
//
// Esquema clássico: data = 07/10/1997 + fator dias
//   fator 0000 = sem vencimento
//   fator 9999 = 21/02/2025 (último dia do esquema clássico)
//
// Rollover FEBRABAN 2025: a partir de 22/02/2025 o fator reiniciou em 1000
//   fator 1000 (novo) = 22/02/2025, fator 1001 = 23/02/2025, etc.
//
// Ambiguidade: fator 1000–9999 existe nos dois esquemas.
// Heurística: calculamos as duas datas e usamos a que cair numa janela razoável
// centrada no dia de hoje (90 dias atrás ↔ 2 anos à frente).

const BASE_CLASSIC = new Date(Date.UTC(1997, 9, 7, 12, 0, 0));  // 07/10/1997 noon UTC
const BASE_NEW     = new Date(Date.UTC(2025, 1, 22, 12, 0, 0)); // 22/02/2025 noon UTC
const NEW_FATOR_ORIGIN = 1000;
const MS_PER_DAY = 86_400_000;

export function fatorVencimentoToDate(fator: number): Date | null {
  if (fator === 0) return null;

  const classicDate = new Date(BASE_CLASSIC.getTime() + fator * MS_PER_DAY);

  // Janela aceitável para qualquer boleto em circulação
  const now = Date.now();
  const windowStart = now - 90  * MS_PER_DAY;
  const windowEnd   = now + 730 * MS_PER_DAY;

  if (classicDate.getTime() >= windowStart && classicDate.getTime() <= windowEnd) {
    return classicDate;
  }

  // Tenta esquema novo (fators reiniciados a partir de 1000 em 22/02/2025)
  if (fator >= NEW_FATOR_ORIGIN) {
    const newDate = new Date(BASE_NEW.getTime() + (fator - NEW_FATOR_ORIGIN) * MS_PER_DAY);
    if (newDate.getTime() >= windowStart && newDate.getTime() <= windowEnd) {
      return newDate;
    }
  }

  return classicDate; // fallback — melhor chute que nulo
}

// ── Tipos e helpers ────────────────────────────────────────────────────────────

export interface BoletoParseResult {
  linhaDigitavel: string | null; // apenas dígitos, 47 ou 48 chars
  amount: number | null;
  dueDate: string | null;        // YYYY-MM-DD ou null
  type: 'bank' | 'utility' | null;
}

function digits(s: string): string {
  return s.replace(/\D/g, '');
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ── Parsers por tipo ───────────────────────────────────────────────────────────

function parseBankDigits(d47: string): Pick<BoletoParseResult, 'amount' | 'dueDate'> {
  // Estrutura do código de barras (reconstruída a partir da linha digitável):
  // [0..2]  banco  [3] moeda  [4] DV  [5..8] fator  [9..18] valor  [19..43] campo livre
  //
  // Na linha digitável de 47 dígitos (índice 0-based):
  //  [0..9]   campo 1 (banco + moeda + livre1 + DV1)
  //  [10..20] campo 2 (livre2 + DV2)
  //  [21..31] campo 3 (livre3 + DV3)
  //  [32]     DV geral do código de barras
  //  [33..36] fator de vencimento  ← posição chave
  //  [37..46] valor (10 dígitos)   ← posição chave

  const fator      = parseInt(d47.slice(33, 37), 10);
  const valorCents = parseInt(d47.slice(37, 47), 10);

  const amount  = valorCents > 0 ? valorCents / 100 : null;
  const dateObj = fatorVencimentoToDate(fator);

  return { amount, dueDate: dateObj ? isoDate(dateObj) : null };
}

function parseUtilityDigits(d48: string): Pick<BoletoParseResult, 'amount' | 'dueDate'> {
  // Estrutura arrecadação (FEBRABAN 21.2):
  //  [0]    identificador produto (8 = arrecadação)
  //  [1]    segmento
  //  [2]    indicador de valor real: 6=BRL, 7=valor referência, 8=sem valor
  //  [3]    DV
  //  [4..14] valor (11 dígitos; os últimos 2 são centavos se indicador=6)
  const indicator  = d48[2];
  let amount: number | null = null;

  if (indicator === '6' || indicator === '7') {
    const cents = parseInt(d48.slice(4, 15), 10);
    amount = cents > 0 ? cents / 100 : null;
  }

  // Data de vencimento não é padronizada entre empresas no formato 48 dígitos
  return { amount, dueDate: null };
}

// ── Extração da linha digitável do texto ───────────────────────────────────────

export function parseLinhaDigitavel(text: string): BoletoParseResult {
  // 1. Regex para boleto bancário (grupos separados por espaços/pontos):
  //    "BBBMM.MMMMM DDDDD.DDDDDD EEEEE.EEEEEE K FFFFFFFFFFFFFFFFFF"
  const bankRe = /(\d{4,5}\.?\d{4,5})\s+(\d{4,5}\.?\d{5,6})\s+(\d{4,5}\.?\d{5,6})\s+(\d)\s+(\d{14})/;
  const bankM  = text.match(bankRe);
  if (bankM) {
    const d = digits(bankM[1] + bankM[2] + bankM[3] + bankM[4] + bankM[5]);
    if (d.length === 47) {
      return { linhaDigitavel: d, type: 'bank', ...parseBankDigits(d) };
    }
  }

  // 2. Regex para arrecadação (4 grupos de ~11–12 dígitos):
  const utilRe = /(\d{10,13})\s+(\d{10,13})\s+(\d{10,13})\s+(\d{10,13})/;
  const utilM  = text.match(utilRe);
  if (utilM) {
    const d = digits(utilM[1] + utilM[2] + utilM[3] + utilM[4]);
    if (d.length === 48) {
      return { linhaDigitavel: d, type: 'utility', ...parseUtilityDigits(d) };
    }
  }

  // 3. Fallback: procura sequência pura de 47 ou 48 dígitos no texto sem espaços/pontos
  const flat = text.replace(/[.\s]/g, '');
  const r47  = flat.match(/\d{47}/);
  if (r47) {
    const d = r47[0];
    return { linhaDigitavel: d, type: 'bank', ...parseBankDigits(d) };
  }
  const r48 = flat.match(/\d{48}/);
  if (r48) {
    const d = r48[0];
    return { linhaDigitavel: d, type: 'utility', ...parseUtilityDigits(d) };
  }

  return { linhaDigitavel: null, amount: null, dueDate: null, type: null };
}

// ── Entrada principal: PDF → resultado ────────────────────────────────────────

export async function parseBoletoFromPDF(buffer: Buffer): Promise<BoletoParseResult> {
  try {
    // pdf-parse é CJS; dynamic require evita problemas de tipagem no build TS
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse');
    const data = await pdfParse(buffer, { max: 5 }); // lê até 5 páginas
    return parseLinhaDigitavel(data.text ?? '');
  } catch {
    // PDF sem camada de texto (imagem escaneada) ou erro de leitura
    return { linhaDigitavel: null, amount: null, dueDate: null, type: null };
  }
}
