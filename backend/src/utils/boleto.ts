// Extração determinística de boleto brasileiro — sem IA
// Suporta: bancário (47 dígitos) e arrecadação/convênio (48 dígitos)
// Inclui validação de DV (módulo 10) e 4 estratégias de busca em cascata

// ── Fator de vencimento ────────────────────────────────────────────────────────
//
// Esquema clássico  : data = 07/10/1997 + fator dias (fator 9999 = 21/02/2025)
// Rollover FEBRABAN : a partir de 22/02/2025, fator reiniciou em 1000
//   → fator 1000 (novo) = 22/02/2025, 1001 = 23/02/2025, ...
//
// Desambiguação: calcula as duas datas possíveis e usa a que cair dentro de
// uma janela razoável centrada hoje (90 dias atrás ↔ 2 anos à frente).
// Em 2026, datas clássicas de fator 1000–9999 ficam em 2000–2025 (passado
// distante) enquanto o esquema novo os mapeia para 2025+ → seleção automática.

const BASE_CLASSIC     = new Date(Date.UTC(1997, 9,  7, 12, 0, 0)); // 07/10/1997 UTC noon
const BASE_NEW         = new Date(Date.UTC(2025, 1, 22, 12, 0, 0)); // 22/02/2025 UTC noon
const NEW_FATOR_ORIGIN = 1000;
const MS_PER_DAY       = 86_400_000;

export function fatorVencimentoToDate(fator: number): Date | null {
  if (fator === 0) return null;

  const classicDate = new Date(BASE_CLASSIC.getTime() + fator * MS_PER_DAY);

  const now         = Date.now();
  const windowStart = now - 90  * MS_PER_DAY;
  const windowEnd   = now + 730 * MS_PER_DAY;

  if (classicDate.getTime() >= windowStart && classicDate.getTime() <= windowEnd) {
    return classicDate; // esquema clássico dentro da janela
  }

  // Tenta esquema novo (rollover FEBRABAN 2025)
  if (fator >= NEW_FATOR_ORIGIN) {
    const newDate = new Date(BASE_NEW.getTime() + (fator - NEW_FATOR_ORIGIN) * MS_PER_DAY);
    if (newDate.getTime() >= windowStart && newDate.getTime() <= windowEnd) {
      return newDate;
    }
  }

  return classicDate; // fallback — retorna clássico mesmo fora da janela
}

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface BoletoParseResult {
  linhaDigitavel: string | null; // apenas dígitos, 47 ou 48 chars
  amount:         number | null;
  dueDate:        string | null; // YYYY-MM-DD ou null
  type:           'bank' | 'utility' | null;
  _strategy?:     string;        // qual estratégia encontrou (debug)
  _rawText?:      string;        // texto bruto do PDF (debug)
}

// ── Validação (módulo 10) ─────────────────────────────────────────────────────

function mod10DV(digits: string): number {
  let sum    = 0;
  let weight = 2;
  for (let i = digits.length - 1; i >= 0; i--) {
    let v = parseInt(digits[i], 10) * weight;
    if (v > 9) v -= 9;
    sum += v;
    weight = weight === 2 ? 1 : 2;
  }
  return (10 - (sum % 10)) % 10;
}

// Valida os DVs dos 3 campos da linha digitável bancária (módulo 10)
export function validateBankDV(d47: string): boolean {
  if (d47.length !== 47) return false;
  const ok = (field: string) =>
    mod10DV(field.slice(0, -1)) === parseInt(field.slice(-1), 10);
  return ok(d47.slice(0, 10)) && ok(d47.slice(10, 21)) && ok(d47.slice(21, 32));
}

// ── Parsers ───────────────────────────────────────────────────────────────────

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseBankDigits(d47: string): Pick<BoletoParseResult, 'amount' | 'dueDate'> {
  // Posições na string de 47 dígitos (índice 0-based):
  //  [33..36] = fator de vencimento (4 dígitos)
  //  [37..46] = valor em centavos  (10 dígitos)
  const fator      = parseInt(d47.slice(33, 37), 10);
  const valorCents = parseInt(d47.slice(37, 47), 10);
  const amount     = valorCents > 0 ? valorCents / 100 : null;
  const dateObj    = fatorVencimentoToDate(fator);
  return { amount, dueDate: dateObj ? isoDate(dateObj) : null };
}

function parseUtilityDigits(d48: string): Pick<BoletoParseResult, 'amount' | 'dueDate'> {
  // [2] = indicador de valor: 6=BRL real, 7=referência, 8=sem valor
  // [4..14] = valor (11 dígitos, últimos 2 = centavos se indicador=6 ou 7)
  const indicator = d48[2];
  let amount: number | null = null;
  if (indicator === '6' || indicator === '7') {
    const cents = parseInt(d48.slice(4, 15), 10);
    amount = cents > 0 ? cents / 100 : null;
  }
  return { amount, dueDate: null }; // data não padronizada em arrecadação
}

function onlyDigits(s: string): string {
  return s.replace(/\D/g, '');
}

// ── Wrappers com DV check ─────────────────────────────────────────────────────

function tryBank(digits: string, strategy: string): BoletoParseResult | null {
  if (digits.length !== 47 || !validateBankDV(digits)) return null;
  return { linhaDigitavel: digits, type: 'bank', _strategy: strategy, ...parseBankDigits(digits) };
}

function tryUtility(digits: string, strategy: string): BoletoParseResult | null {
  if (digits.length !== 48) return null;
  return { linhaDigitavel: digits, type: 'utility', _strategy: strategy, ...parseUtilityDigits(digits) };
}

// ── Estratégias de busca ───────────────────────────────────────────────────────
//
// Cascata: cada estratégia é tentada em ordem; retorna no primeiro sucesso.

/**
 * Estratégia 1 – regex flexível sobre o texto com espaços e pontos.
 *
 * Formatos reconhecidos (exemplos):
 *   "BBBBB.BBBBB DDDDD.DDDDDD EEEEE.EEEEEE K FFFFFFFFFFFFFFFF"   (Bradesco, Itaú…)
 *   "BBBBB BBBBB DDDDD DDDDDD EEEEE EEEEEE K FFFFFFFFFFFFFFFF"   (sem pontos)
 *   grupos separados por newlines ou múltiplos espaços
 *
 * Usa `\s*` entre grupos para tolerar newlines e espaços variados.
 * DV validation filtra falsos positivos.
 */
function strategy1_flexibleRegex(text: string): BoletoParseResult | null {
  // Banco: 5+5 · 5+6 · 5+6 · 1 · 14  (separadores opcionais entre sub-grupos)
  const bankRe =
    /(\d{5})[.\s]?(\d{5})\s*(\d{5})[.\s]?(\d{6})\s*(\d{5})[.\s]?(\d{6})\s*(\d)\s*(\d{14})/g;
  let m: RegExpExecArray | null;
  while ((m = bankRe.exec(text)) !== null) {
    const d = onlyDigits(m[1]+m[2]+m[3]+m[4]+m[5]+m[6]+m[7]+m[8]);
    const r = tryBank(d, 'strategy1_bank');
    if (r) return r;
  }

  // Arrecadação: 4 blocos de 11–12 dígitos separados por espaços/hífens
  const utilRe = /(\d{10,13})[\s-]+(\d{10,13})[\s-]+(\d{10,13})[\s-]+(\d{10,13})/g;
  let um: RegExpExecArray | null;
  while ((um = utilRe.exec(text)) !== null) {
    const d = onlyDigits(um[1]+um[2]+um[3]+um[4]);
    const r = tryUtility(d, 'strategy1_utility');
    if (r) return r;
  }

  return null;
}

/**
 * Estratégia 2 – linha a linha.
 *
 * Para cada linha do texto, remove tudo que não é dígito e verifica se o
 * resultado tem exatamente 47 ou 48 dígitos. Evita misturar números de linhas
 * diferentes (CNPJ, datas, valores parciais).
 */
function strategy2_lineByLine(text: string): BoletoParseResult | null {
  for (const line of text.split(/\r?\n/)) {
    const d = onlyDigits(line);
    const rb = tryBank(d, 'strategy2_lineByLine_bank');
    if (rb) return rb;
    const ru = tryUtility(d, 'strategy2_lineByLine_utility');
    if (ru) return ru;
  }
  return null;
}

/**
 * Estratégia 3 – janela deslizante de 2–6 linhas consecutivas.
 *
 * Útil quando a linha digitável vem quebrada em múltiplas linhas no PDF.
 * DV validation é essencial aqui para descartar combinações aleatórias.
 */
function strategy3_slidingWindow(text: string): BoletoParseResult | null {
  const lines = text.split(/\r?\n/).filter(l => /\d/.test(l));
  for (let i = 0; i < lines.length; i++) {
    for (let sz = 2; sz <= Math.min(6, lines.length - i); sz++) {
      const d = onlyDigits(lines.slice(i, i + sz).join(' '));
      const rb = tryBank(d, `strategy3_window_${i}_${sz}`);
      if (rb) return rb;
      const ru = tryUtility(d, `strategy3_window_${i}_${sz}`);
      if (ru) return ru;
    }
  }
  return null;
}

/**
 * Estratégia 4 – regex mais permissivo (4+5, 4+5 dígitos por grupo).
 *
 * Cobre bancos que usam grupos ligeiramente diferentes (ex: 4+5 em vez de 5+5).
 */
function strategy4_looseBankRegex(text: string): BoletoParseResult | null {
  const re = /(\d{4,5})[.\s]?(\d{4,6})\s*(\d{4,5})[.\s]?(\d{5,6})\s*(\d{4,5})[.\s]?(\d{5,6})\s*(\d)\s*(\d{14})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const d = onlyDigits(m[1]+m[2]+m[3]+m[4]+m[5]+m[6]+m[7]+m[8]);
    const r = tryBank(d, 'strategy4_looseRegex');
    if (r) return r;
  }
  return null;
}

// ── Ponto de entrada ──────────────────────────────────────────────────────────

export function parseLinhaDigitavel(text: string): BoletoParseResult {
  return (
    strategy1_flexibleRegex(text) ??
    strategy2_lineByLine(text)    ??
    strategy3_slidingWindow(text) ??
    strategy4_looseBankRegex(text) ??
    { linhaDigitavel: null, amount: null, dueDate: null, type: null }
  );
}

export async function parseBoletoFromPDF(
  buffer: Buffer,
  includeDebug = false,
): Promise<BoletoParseResult> {
  let rawText = '';
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse');
    const data = await pdfParse(buffer, { max: 5 });
    rawText = data.text ?? '';
  } catch {
    const r: BoletoParseResult = { linhaDigitavel: null, amount: null, dueDate: null, type: null };
    if (includeDebug) r._rawText = '[pdf-parse throw]';
    return r;
  }

  const result = parseLinhaDigitavel(rawText);
  if (includeDebug) result._rawText = rawText;
  return result;
}
