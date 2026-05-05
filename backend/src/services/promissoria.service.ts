import puppeteer from 'puppeteer';
import { format } from 'date-fns';
import { eq, and, isNull, asc } from 'drizzle-orm';
import { db } from '../database';
import { sales, customers, installments } from '../database/schema';
import { AppError } from '../utils/AppError';

// --- numberToWords ---

function integerToWords(n: number): string {
  if (n === 0) return 'zero';

  const units = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
  const teens = ['dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
  const tens = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
  const hundreds = ['', 'cem', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

  if (n >= 1_000_000) {
    const m = Math.floor(n / 1_000_000);
    const rem = n % 1_000_000;
    const mText = m === 1 ? 'um milhão' : `${integerToWords(m)} milhões`;
    if (rem === 0) return mText;
    if (rem < 100 || rem % 100 === 0) return `${mText} e ${integerToWords(rem)}`;
    return `${mText} ${integerToWords(rem)}`;
  }

  if (n >= 1_000) {
    const t = Math.floor(n / 1_000);
    const rem = n % 1_000;
    const tText = t === 1 ? 'um mil' : `${integerToWords(t)} mil`;
    if (rem === 0) return tText;
    if (rem < 100 || rem % 100 === 0) return `${tText} e ${integerToWords(rem)}`;
    return `${tText} ${integerToWords(rem)}`;
  }

  if (n >= 100) {
    const h = Math.floor(n / 100);
    const rem = n % 100;
    let hText = hundreds[h];
    if (h === 1 && rem > 0) hText = 'cento';
    if (rem === 0) return hText;
    return `${hText} e ${integerToWords(rem)}`;
  }

  if (n >= 20) {
    const t = Math.floor(n / 10);
    const u = n % 10;
    if (u === 0) return tens[t];
    return `${tens[t]} e ${units[u]}`;
  }

  if (n >= 10) return teens[n - 10];

  return units[n];
}

export function numberToWords(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  const intPart = Math.floor(rounded);
  const decPart = Math.round((rounded - intPart) * 100);

  const reaisText = intPart === 0 ? 'zero' : integerToWords(intPart);
  const reaisLabel = intPart === 1 ? 'real' : 'reais';
  let result = `${reaisText} ${reaisLabel}`;

  if (decPart > 0) {
    const centavosText = integerToWords(decPart);
    const centavosLabel = decPart === 1 ? 'centavo' : 'centavos';
    result += ` e ${centavosText} ${centavosLabel}`;
  }

  return result.charAt(0).toUpperCase() + result.slice(1);
}

// --- Formatters ---

function brl(value: string | number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value));
}

const MONTHS_PT = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

function fullDatePt(date: Date | string | null): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  return `${d.getDate()} de ${MONTHS_PT[d.getMonth()]} de ${d.getFullYear()}`;
}

function fmtDate(date: Date | string | null): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  return format(d, 'dd/MM/yyyy');
}

// --- Data fetching ---

async function getPromissoriaData(saleId: string) {
  const rows = await db
    .select({
      id: sales.id,
      saleNumber: sales.saleNumber,
      saleDate: sales.saleDate,
      totalAmount: sales.totalAmount,
      customerName: customers.name,
      customerCpf: customers.cpf,
      customerAddressStreet: customers.addressStreet,
      customerAddressNumber: customers.addressNumber,
      customerAddressNeighborhood: customers.addressNeighborhood,
      customerAddressCity: customers.addressCity,
      customerAddressState: customers.addressState,
      customerCep: customers.cep,
    })
    .from(sales)
    .leftJoin(customers, eq(sales.customerId, customers.id))
    .where(and(eq(sales.id, saleId), isNull(sales.deletedAt)))
    .limit(1);

  if (rows.length === 0) throw new AppError('Venda não encontrada', 404);

  const insts = await db
    .select()
    .from(installments)
    .where(and(eq(installments.saleId, saleId), isNull(installments.deletedAt)))
    .orderBy(asc(installments.installmentNumber));

  const entryInstallment = insts.find(i => i.installmentNumber === 0) ?? null;
  const regularInstallments = insts.filter(i => i.installmentNumber > 0);

  return { ...rows[0], entryInstallment, regularInstallments };
}

// --- HTML builder ---

function buildPromissoriaHtml(data: Awaited<ReturnType<typeof getPromissoriaData>>): string {
  const {
    saleNumber, saleDate, totalAmount,
    customerName, customerCpf,
    customerAddressStreet, customerAddressNumber, customerAddressNeighborhood,
    customerAddressCity, customerAddressState, customerCep,
    entryInstallment, regularInstallments,
  } = data;

  const total = Number(totalAmount);
  const count = regularInstallments.length || 1;
  const installmentValue = count > 0 ? Number(regularInstallments[0]?.originalAmount ?? 0) : 0;

  const emissaoFull = fullDatePt(saleDate);
  const emissaoDdMm = fmtDate(saleDate);
  const addressLine = [customerAddressStreet, customerAddressNumber].filter(Boolean).join(', ');

  // Linha de entrada (se existir)
  const entradaHtml = entryInstallment
    ? (() => {
        const entradaAmt = Number(entryInstallment.originalAmount);
        const entradaDate = entryInstallment.paymentDate ?? entryInstallment.dueDate;
        return `<div class="row" style="margin-top:1.5mm">
    <b>Entrada:</b> ${brl(entradaAmt)} &mdash; paga em <b>${fmtDate(entradaDate)}</b>
  </div>`;
      })()
    : '';

  const css = `
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 11px;
      color: #111;
      background: #fff;
      padding: 12mm 15mm;
    }

    .outer {
      border: 2px solid #222;
      padding: 7mm 9mm 8mm;
    }

    /* Cabeçalho */
    .hdr {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #222;
      padding-bottom: 4mm;
      margin-bottom: 5mm;
    }
    .hdr-meta { font-size: 9.5px; color: #444; line-height: 1.7; }
    .titulo {
      font-size: 28px;
      font-weight: 900;
      letter-spacing: 6px;
      text-align: center;
    }
    .hdr-num { text-align: right; font-size: 11px; font-weight: bold; line-height: 1.7; }

    /* Caixa de valor */
    .valor-box {
      border: 2px solid #222;
      border-radius: 2px;
      padding: 3.5mm 6mm;
      margin-bottom: 5mm;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .valor-label { font-size: 9px; font-weight: bold; letter-spacing: 1.5px; color: #444; text-transform: uppercase; }
    .valor-num { font-size: 26px; font-weight: 900; }

    /* Linhas de dados */
    .row { line-height: 2; margin-bottom: 0; }
    .row b { font-weight: bold; }

    /* Seção emitente */
    .emitente-box {
      border: 1px solid #555;
      padding: 4mm 5mm 6mm;
      margin-top: 5mm;
    }
    .emitente-title {
      font-weight: bold;
      text-align: center;
      font-size: 10px;
      letter-spacing: 2px;
      border-bottom: 1px solid #bbb;
      padding-bottom: 2mm;
      margin-bottom: 3mm;
    }

    /* Linha de assinatura */
    .sig-wrap { margin-top: 14mm; text-align: center; }
    .sig-line {
      border-top: 1px solid #333;
      width: 76%;
      margin: 0 auto;
      padding-top: 2.5mm;
      font-size: 10px;
    }
    .sig-sublabel { font-size: 9px; color: #666; margin-top: 1mm; }
  `;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><style>${css}</style></head>
<body>
<div class="outer">

  <!-- Cabeçalho -->
  <div class="hdr">
    <div class="hdr-meta">
      Emissão: ${emissaoDdMm}<br>
      Jaboticabal - SP
    </div>
    <div class="titulo">PROMISSÓRIA</div>
    <div class="hdr-num">Nº ${saleNumber}</div>
  </div>

  <!-- Valor em destaque -->
  <div class="valor-box">
    <span class="valor-label">Valor</span>
    <span class="valor-num">${brl(total)}</span>
  </div>

  <!-- Importância por extenso -->
  <div class="row">Importância de: <b>${numberToWords(total)}</b></div>
  ${entradaHtml}
  <div class="row" style="margin-top:1.5mm">
    <b>Parcelamento:</b> Dividido em <b>${count}</b> parcela${count > 1 ? 's' : ''} de <b>${brl(installmentValue)}</b> cada
  </div>

  <!-- Texto legal -->
  <div class="row" style="margin-top:4mm; line-height:1.9">
    Pelo presente instrumento, o(a) emitente abaixo qualificado(a) se compromete a pagar ao beneficiário
    identificado neste documento, a importância acima especificada, de forma parcelada, nas datas de
    vencimento de cada parcela conforme acordado no ato da compra.
  </div>

  <!-- Beneficiário -->
  <div class="row" style="margin-top:4mm"><b>BENEFICIÁRIO:</b> AMOR INFINITO ENXOVAIS LTDA</div>
  <div class="row"><b>CNPJ:</b> 47.401.804/0001-66</div>
  <div class="row"><b>ENDEREÇO DO BENEFICIÁRIO:</b> Rua Fortunato Frasca, 691, Jaboticabal - SP, CEP 14.875-320</div>

  <!-- Praça e data de emissão -->
  <div class="row" style="margin-top:4mm"><b>PRAÇA DE PAGAMENTO:</b> Jaboticabal - SP</div>
  <div class="row"><b>LOCAL E DATA DE EMISSÃO:</b> Jaboticabal - SP, ${emissaoFull}</div>

  <!-- Emitente -->
  <div class="emitente-box">
    <div class="emitente-title">EMITENTE (DEVEDOR)</div>
    <div class="row"><b>NOME:</b> ${customerName ?? ''}</div>
    <div class="row"><b>CPF:</b> ${customerCpf ?? ''}</div>
    ${addressLine ? `<div class="row"><b>ENDEREÇO:</b> ${addressLine}</div>` : ''}
    <div class="row">
      ${customerAddressNeighborhood ? `<b>BAIRRO:</b> ${customerAddressNeighborhood}&nbsp;&nbsp;&nbsp;` : ''}
      ${customerAddressCity ? `<b>CIDADE:</b> ${customerAddressCity}&nbsp;&nbsp;&nbsp;` : ''}
      ${customerAddressState ? `<b>UF:</b> ${customerAddressState}` : ''}
    </div>
    ${customerCep ? `<div class="row"><b>CEP:</b> ${customerCep}</div>` : ''}

    <div class="sig-wrap">
      <div class="sig-line">${customerName ?? ''}</div>
      <div class="sig-sublabel">Assinatura do Emitente</div>
    </div>
  </div>

</div>
</body>
</html>`;
}

// --- PDF generation ---

export async function generatePromissoriaPdf(saleId: string): Promise<Buffer> {
  const data = await getPromissoriaData(saleId);
  const html = buildPromissoriaHtml(data);

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', bottom: '0', left: '0', right: '0' },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
