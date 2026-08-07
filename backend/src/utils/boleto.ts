// Extração determinística de boleto brasileiro — sem IA
// Suporta: bancário (47 dígitos) e arrecadação/convênio (48 dígitos)
// Inclui validação de DV (módulo 10) e 5 estratégias de busca em cascata

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
 *   "BBBBB. BBBBB DDDDD. DDDDDD …"   (SICOOB e outros com espaço após ponto)
 *   "BBBBB BBBBB DDDDD DDDDDD …"     (sem pontos)
 *   grupos separados por newlines ou múltiplos espaços
 *
 * Usa `[.\s]{0,3}` entre sub-grupos (até 3 chars não-dígito) para absorver
 * layouts como "75691. 31258" (ponto + espaço) sem quebrar o matching.
 * DV validation filtra falsos positivos.
 */
function strategy1_flexibleRegex(text: string): BoletoParseResult | null {
  // Banco: 5+5 · 5+6 · 5+6 · 1 · 14
  // [.\s]{0,3} tolera ". " (ponto-espaço) e variantes comuns do SICOOB/outros
  const bankRe =
    /(\d{5})[.\s]{0,3}(\d{5})\s*(\d{5})[.\s]{0,3}(\d{6})\s*(\d{5})[.\s]{0,3}(\d{6})\s*(\d)\s*(\d{14})/g;
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
 * Também usa [.\s]{0,3} para ser consistente com strategy1.
 */
function strategy4_looseBankRegex(text: string): BoletoParseResult | null {
  const re = /(\d{4,5})[.\s]{0,3}(\d{4,6})\s*(\d{4,5})[.\s]{0,3}(\d{5,6})\s*(\d{4,5})[.\s]{0,3}(\d{5,6})\s*(\d)\s*(\d{14})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const d = onlyDigits(m[1]+m[2]+m[3]+m[4]+m[5]+m[6]+m[7]+m[8]);
    const r = tryBank(d, 'strategy4_looseRegex');
    if (r) return r;
  }
  return null;
}

/**
 * Estratégia 5 – janela deslizante sobre TODOS os dígitos do documento.
 *
 * Remove todos os caracteres não-numéricos do texto completo e desliza uma
 * janela de 47 (bancário) ou 48 (arrecadação) dígitos validando o DV a cada
 * posição. Funciona independente de como o pdf-parse extraiu o texto:
 * pontos, espaços duplos, tabulações, quebras de linha, caracteres Unicode
 * especiais — tudo é ignorado. A validação de DV (módulo 10 nos 3 campos)
 * elimina falsos positivos.
 *
 * Cobre layouts do SICOOB e outros bancos onde as estratégias anteriores
 * falham devido a separadores inesperados entre os blocos da linha digitável.
 */
function strategy5_allDigitsSlide(text: string): BoletoParseResult | null {
  const all = text.replace(/\D/g, '');

  // Bancário (47 dígitos): DV validation forte → baixíssimo risco de falso positivo
  for (let i = 0; i <= all.length - 47; i++) {
    const r = tryBank(all.slice(i, i + 47), `strategy5_bank_pos${i}`);
    if (r) return r;
  }

  // Arrecadação (48 dígitos): sem DV obrigatório, mas indica pelo tipo
  for (let i = 0; i <= all.length - 48; i++) {
    const r = tryUtility(all.slice(i, i + 48), `strategy5_utility_pos${i}`);
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
    strategy5_allDigitsSlide(text) ??
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

// ── Batch parsing (PDF com múltiplos boletos) ─────────────────────────────────

export interface BatchBoletoItem {
  linhaDigitavel: string;
  amount: number | null;
  dueDate: string | null; // YYYY-MM-DD
}

export interface BatchBoletoResult {
  found: number;
  beneficiary: string | null;
  docRef: string | null;
  totalInstallments: number | null;
  boletos: BatchBoletoItem[];
}

function findAllBankLinhas(text: string): string[] {
  const found: string[] = [];
  const bankRe =
    /(\d{5})[.\s]{0,3}(\d{5})\s*(\d{5})[.\s]{0,3}(\d{6})\s*(\d{5})[.\s]{0,3}(\d{6})\s*(\d)\s*(\d{14})/g;
  let m: RegExpExecArray | null;
  while ((m = bankRe.exec(text)) !== null) {
    const d = onlyDigits(m[1]+m[2]+m[3]+m[4]+m[5]+m[6]+m[7]+m[8]);
    if (d.length === 47 && validateBankDV(d) && !found.includes(d)) {
      found.push(d);
    }
  }
  return found;
}

function extractBoletoMeta(text: string): {
  beneficiary: string | null;
  docRef: string | null;
  totalInstallments: number | null;
} {
  // Procura "Beneficiário" sozinho na linha, seguido do nome na linha seguinte
  let beneficiary: string | null = null;
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length - 1; i++) {
    if (/^Benefici[aá]rio\s*$/i.test(lines[i].trim())) {
      const next = lines[i + 1].trim();
      if (next && next.length > 2 && /[A-Z]{2,}/.test(next) && !/^Agênc/i.test(next)) {
        beneficiary = next.replace(/\s+/g, ' ');
        break;
      }
    }
  }
  // Fallback: Beneficiário seguido de nome na mesma linha ou logo após
  if (!beneficiary) {
    const bm = text.match(/Benefici[aá]rio[\s\n\r]+([A-ZÁÀÂÃÉÈÊÍÓÔÕÚ][^\n\r]{2,80})/);
    if (bm) {
      const candidate = bm[1].trim().split(/[\n\r]/)[0].trim();
      if (!/^Agênc/i.test(candidate)) beneficiary = candidate.replace(/\s+/g, ' ');
    }
  }

  // Referência do documento: ex "REN099261 - 2/6" → docRef=REN099261, total=6
  const dm = text.match(/([A-Z]{2,6}\d{4,10})\s*-\s*\d+\/(\d+)/);
  const docRef = dm ? dm[1] : null;
  const totalInstallments = dm ? parseInt(dm[2]) : null;

  return { beneficiary, docRef, totalInstallments };
}

export async function parseBatchBoletosFromPDF(buffer: Buffer): Promise<BatchBoletoResult> {
  let rawText = '';
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse');
    const data = await pdfParse(buffer, { max: 30 });
    rawText = data.text ?? '';
  } catch {
    return { found: 0, beneficiary: null, docRef: null, totalInstallments: null, boletos: [] };
  }

  const linhas = findAllBankLinhas(rawText);
  const meta   = extractBoletoMeta(rawText);

  const boletos: BatchBoletoItem[] = linhas.map(d => ({
    linhaDigitavel: d,
    ...parseBankDigits(d),
  }));

  // Ordenar por data de vencimento crescente
  boletos.sort((a, b) => {
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return a.dueDate.localeCompare(b.dueDate);
  });

  return {
    found: boletos.length,
    beneficiary: meta.beneficiary,
    docRef: meta.docRef,
    totalInstallments: meta.totalInstallments,
    boletos,
  };
}
