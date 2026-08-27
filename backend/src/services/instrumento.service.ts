import puppeteer from 'puppeteer';
import { eq, and, isNull, asc } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { db } from '../database';
import { sales, customers, installments, saleItems, products } from '../database/schema';
import { AppError } from '../utils/AppError';
import { numberToWords } from './promissoria.service';

const MONTHS_PT = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

// Regex-based pt-BR number format (avoids ICU/timezone dependency)
function numBr(value: string | number): string {
  const [i, d] = Number(value).toFixed(2).split('.');
  return `${i.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${d}`;
}

function brl(value: string | number): string {
  return `R$ ${numBr(value)}`;
}

function esc(s: string | null | undefined): string {
  return (s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Safe formatter for DATE columns: handles "YYYY-MM-DD" string or Date (UTC)
function fmtDate(val: unknown): string {
  if (!val) return '';
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
    const [y, m, d] = val.split('-');
    return `${d}/${m}/${y}`;
  }
  const d = val instanceof Date ? val : new Date(String(val));
  const day   = String(d.getUTCDate()).padStart(2, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${d.getUTCFullYear()}`;
}

// ─── Data fetching ────────────────────────────────────────────────────────────

async function getInstrumentoData(saleId: string) {
  const rows = await db
    .select({
      id:                       sales.id,
      saleNumber:               sales.saleNumber,
      saleDate:                 sales.saleDate,
      totalAmount:              sales.totalAmount,
      paymentMethod:            sales.paymentMethod,
      installmentsCount:        sales.installmentsCount,
      customerName:             customers.name,
      customerCpf:              customers.cpf,
      customerBirthDate:        customers.birthDate,
      customerAddressStreet:    customers.addressStreet,
      customerAddressNumber:    customers.addressNumber,
      customerAddressNeighborhood: customers.addressNeighborhood,
      customerAddressCity:      customers.addressCity,
      customerAddressState:     customers.addressState,
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

  const items = await db
    .select({
      quantity:    saleItems.quantity,
      unitPrice:   saleItems.unitPrice,
      totalPrice:  saleItems.totalPrice,
      productName: products.name,
    })
    .from(saleItems)
    .innerJoin(products, eq(saleItems.productId, products.id))
    .where(eq(saleItems.saleId, saleId));

  // Current date in SP via MySQL — avoids ICU/toLocaleString issues on Railway
  const tzResult = await db.execute(sql`
    SELECT
      DAY(CONVERT_TZ(NOW(), '+00:00', '-03:00'))   AS sp_day,
      MONTH(CONVERT_TZ(NOW(), '+00:00', '-03:00'))  AS sp_month,
      YEAR(CONVERT_TZ(NOW(), '+00:00', '-03:00'))   AS sp_year
  `);
  const tzRow = (tzResult[0] as any[])[0] ?? {};

  const regularInsts = insts.filter(i => i.installmentNumber > 0);
  const firstInstallment = regularInsts[0] ?? null;

  return {
    ...rows[0],
    regularInstallments: regularInsts,
    firstInstallment,
    items,
    spDay:   Number(tzRow.sp_day),
    spMonth: Number(tzRow.sp_month) - 1, // 0-indexed for MONTHS_PT
    spYear:  Number(tzRow.sp_year),
  };
}

// ─── HTML builder ─────────────────────────────────────────────────────────────

function buildInstrumentoHtml(data: Awaited<ReturnType<typeof getInstrumentoData>>): string {
  const {
    totalAmount, paymentMethod, installmentsCount,
    customerName, customerCpf, customerBirthDate,
    customerAddressStreet, customerAddressNumber,
    customerAddressNeighborhood, customerAddressCity, customerAddressState,
    saleDate, regularInstallments, firstInstallment, items,
    spDay, spMonth, spYear,
  } = data;

  const total = Number(totalAmount);

  // ── Address ───────────────────────────────────────────────────────────────
  const addrParts: string[] = [];
  if (customerAddressStreet) {
    addrParts.push(customerAddressNumber
      ? `${customerAddressStreet}, nº ${customerAddressNumber}`
      : customerAddressStreet);
  }
  if (customerAddressNeighborhood) addrParts.push(`Bairro ${customerAddressNeighborhood}`);
  if (customerAddressCity && customerAddressState) {
    addrParts.push(`${customerAddressCity}/${customerAddressState}`);
  } else if (customerAddressCity) {
    addrParts.push(customerAddressCity);
  } else if (customerAddressState) {
    addrParts.push(customerAddressState);
  }
  const endereco = esc(addrParts.join(', ')) || '________________________________________';

  // ── Payment form ─────────────────────────────────────────────────────────
  const isInstallment = paymentMethod === 'installment';
  const aVistaX    = isInstallment ? '&nbsp;&nbsp;' : 'X';
  const parceladoX = isInstallment ? 'X' : '&nbsp;&nbsp;';

  const dataAVista  = !isInstallment ? fmtDate(saleDate) : '___________';
  const numParcelas = isInstallment
    ? String(regularInstallments.length || installmentsCount || 1)
    : '_____';
  const valorParcelaNum = isInstallment && firstInstallment
    ? numBr(firstInstallment.originalAmount)
    : '_________';
  const dataPrimeira = isInstallment && firstInstallment
    ? fmtDate(firstInstallment.dueDate)
    : '___________';

  // ── Document date ─────────────────────────────────────────────────────────
  const dataExtenso = `${spDay} de ${MONTHS_PT[spMonth]} de ${spYear}`;

  // ── Birth date ────────────────────────────────────────────────────────────
  const nascimento = fmtDate(customerBirthDate) || '______/______/________';

  // ── Items table rows ──────────────────────────────────────────────────────
  const itemsRows = items.length > 0
    ? items.map(item => `
      <tr>
        <td>${esc(item.productName)}</td>
        <td class="c">${Number(item.quantity)}</td>
        <td class="r">${brl(item.unitPrice)}</td>
        <td class="r">${brl(item.totalPrice)}</td>
      </tr>`).join('')
    : '<tr><td colspan="4" class="c" style="color:#888;">Nenhum item</td></tr>';

  const css = `
    @page { size: A4; margin: 18mm 20mm 18mm 20mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 11pt;
      color: #111;
      line-height: 1.65;
    }
    .title {
      text-align: center;
      font-size: 13pt;
      font-weight: bold;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      border-bottom: 2px solid #111;
      padding-bottom: 4mm;
      margin-bottom: 7mm;
    }
    .party   { margin-bottom: 2.5mm; }
    .spacer  { margin-bottom: 5mm; }
    .body-text { text-align: justify; margin-bottom: 4.5mm; }
    .payment-section { margin: 1mm 0 4.5mm; }
    .payment-opt { margin: 2.5mm 0 2.5mm 3mm; }
    .sig-wrap {
      display: flex;
      justify-content: space-around;
      margin-top: 15mm;
    }
    .sig-block { text-align: center; width: 40%; }
    .sig-line  {
      border-top: 1px solid #333;
      padding-top: 3mm;
      font-size: 10pt;
      font-weight: bold;
      letter-spacing: 1px;
    }
    .witnesses { margin-top: 8mm; }
    .witness-row { display: flex; gap: 15mm; margin-top: 7mm; }
    .witness-col { flex: 1; }
    .blank { display: inline-block; border-bottom: 1px solid #444; width: 54mm; vertical-align: bottom; margin-left: 2mm; }

    /* Annex — page 2 */
    .page-break { page-break-before: always; padding-top: 5mm; }
    .annex-title { font-size: 12pt; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 5mm; }
    table  { width: 100%; border-collapse: collapse; font-size: 10pt; }
    th     { background: #ddd; padding: 5px 8px; border: 1px solid #888; font-weight: bold; }
    td     { padding: 4px 8px; border: 1px solid #ccc; }
    .r     { text-align: right; }
    .c     { text-align: center; }
    tfoot td { background: #eee; font-weight: bold; border: 1px solid #888; }
  `;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <style>${css}</style>
</head>
<body>

<div class="title">Instrumento de Compra e Venda</div>

<div class="party"><strong>COMPRADOR(A):</strong> ${esc(customerName ?? '')}</div>
<div class="party"><strong>Data nascimento:</strong> ${nascimento}&nbsp;&nbsp;&nbsp;<strong>CPF:</strong> ${esc(customerCpf ?? '')}</div>
<div class="party spacer"><strong>Endereço:</strong> ${endereco}</div>

<div class="party spacer"><strong>VENDEDOR(A):</strong> AMOR INFINITO ENXOVAIS LTDA, pessoa jur&#237;dica de direito privado, inscrita no CNPJ n&#186; 47.401.804/0001-66, com endere&#231;o na Rua Fortunato Frasca, n&#186; 691, bairro Jardim das Rosas, Jaboticabal/SP, CEP 14871-800, representado por CELITA VIEIRA DA SILVA.</div>

<p class="body-text">O(A) COMPRADOR(A) reconhece, de forma livre, expressa, irretrat&#225;vel e irrevog&#225;vel, que adquiriu diversos produtos junto ao VENDEDOR(A), conforme discri&#231;&#227;o/nota (em anexo), totalizando a quantia de R$&nbsp;${numBr(total)} (${esc(numberToWords(total))}) valor este devidamente apurado e aceito pelas partes. Tal reconhecimento configura confiss&#227;o de d&#237;vida, nos termos do art. 389 do C&#243;digo Civil.</p>

<p class="body-text">A d&#237;vida ora confessada decorre da aquisi&#231;&#227;o de mercadorias, as quais foram devidamente entregues, recebidas e utilizadas, inexistindo qualquer v&#237;cio, defeito ou contesta&#231;&#227;o quanto &#224; origem, legitimidade ou exigibilidade do d&#233;bito, estando o(a) COMPRADOR(A) de total acordo dos termos ap&#243;s ter lido e assinado o presente instrumento.</p>

<p class="body-text">O valor total da aquisi&#231;&#227;o (compra) ser&#225; pago da seguinte forma:</p>

<div class="payment-section">
  <div class="payment-opt">( ${aVistaX} ) &#192; vista, at&#233; o dia ${dataAVista};</div>
  <div class="payment-opt">( ${parceladoX} ) Parcelado, em ${numParcelas} parcelas mensais e sucessivas de R$&nbsp;${valorParcelaNum}, cada com vencimento da primeira em ${dataPrimeira}, as demais nos meses sucessivos.</div>
</div>

<p class="body-text">O inadimplemento implicar&#225; no vencimento antecipado do saldo remanescente, acrescido de multa de 10% sobre o saldo, juros morat&#243;rios de 1% ao m&#234;s e corre&#231;&#227;o monet&#225;ria.</p>

<p class="body-text">O presente instrumento constitui t&#237;tulo executivo extrajudicial, conforme autoriza o art. 784, inciso III, do C&#243;digo de Processo Civil, est&#227;o as partes de comum acordo e cientes. Fica eleito o foro da comarca de Jaboticabal - SP, para dirimir qualquer lit&#237;gio.</p>

<p style="margin-top:10mm;">Jaboticabal &#8211; SP, ${dataExtenso}.</p>

<div class="sig-wrap">
  <div class="sig-block"><div class="sig-line">VENDEDOR</div></div>
  <div class="sig-block"><div class="sig-line">COMPRADOR</div></div>
</div>

<div class="witnesses">
  <p><strong>Testemunhas:</strong></p>
  <div class="witness-row">
    <div class="witness-col">Nome:<span class="blank">&nbsp;</span></div>
    <div class="witness-col">Nome:<span class="blank">&nbsp;</span></div>
  </div>
  <div class="witness-row">
    <div class="witness-col">CPF:<span class="blank">&nbsp;</span></div>
    <div class="witness-col">CPF:<span class="blank">&nbsp;</span></div>
  </div>
</div>

<!-- ANNEX: product list -->
<div class="page-break">
  <div class="annex-title">Rela&#231;&#227;o de Produtos (em anexo)</div>
  <table>
    <thead>
      <tr>
        <th>Produto</th>
        <th class="c" style="width:50px;">Qtd</th>
        <th class="r" style="width:100px;">Vlr. Unit.</th>
        <th class="r" style="width:110px;">Total</th>
      </tr>
    </thead>
    <tbody>${itemsRows}</tbody>
    <tfoot>
      <tr>
        <td colspan="3" class="r">TOTAL GERAL</td>
        <td class="r">${brl(total)}</td>
      </tr>
    </tfoot>
  </table>
</div>

</body>
</html>`;
}

// ─── PDF generation ───────────────────────────────────────────────────────────

export async function generateInstrumentoPdf(saleId: string): Promise<Buffer> {
  const data = await getInstrumentoData(saleId);
  const html = buildInstrumentoHtml(data);

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
    const pdf = await page.pdf({ format: 'A4', printBackground: true });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
