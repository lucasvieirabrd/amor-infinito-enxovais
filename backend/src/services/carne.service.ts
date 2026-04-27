import puppeteer from 'puppeteer';
import QRCode from 'qrcode';
import { format } from 'date-fns';
import { eq, and, isNull, inArray, asc } from 'drizzle-orm';
import { db } from '../database';
import { sales, saleItems, installments, customers, products, settings } from '../database/schema';
import { AppError } from '../utils/AppError';

// --- PIX BR Code EMV ---

function emvField(id: string, value: string): string {
  return `${id}${value.length.toString().padStart(2, '0')}${value}`;
}

function crc16(str: string): string {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function buildPixPayload(key: string, amount: number, merchantName: string, city: string): string {
  const merchantAccount =
    emvField('00', 'BR.GOV.BCB.PIX') + emvField('01', key.trim());

  const body =
    emvField('00', '01') +
    emvField('26', merchantAccount) +
    emvField('52', '0000') +
    emvField('53', '986') +
    emvField('54', amount.toFixed(2)) +
    emvField('58', 'BR') +
    emvField('59', merchantName.slice(0, 25)) +
    emvField('60', city.slice(0, 15)) +
    emvField('62', emvField('05', '***')) +
    '6304';

  return body + crc16(body);
}

// --- Formatters ---

function brl(value: string | number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    Number(value)
  );
}

function fmtDate(date: Date | string | null): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  return format(d, 'dd/MM/yyyy');
}

function fmtPhone(rawPhone: string | null): string {
  if (!rawPhone) return '';
  const digits = rawPhone.replace(/\D/g, '');
  const local = digits.length === 13 && digits.startsWith('55') ? digits.slice(2) : digits;
  return local.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
}

// --- Data fetching ---

export async function getCarneData(saleId: string) {
  const saleRows = await db
    .select({
      id: sales.id,
      saleNumber: sales.saleNumber,
      saleDate: sales.saleDate,
      totalAmount: sales.totalAmount,
      paymentMethod: sales.paymentMethod,
      installmentsCount: sales.installmentsCount,
      customerName: customers.name,
      customerCpf: customers.cpf,
      customerPhone: customers.phone,
    })
    .from(sales)
    .leftJoin(customers, eq(sales.customerId, customers.id))
    .where(and(eq(sales.id, saleId), isNull(sales.deletedAt)))
    .limit(1);

  if (saleRows.length === 0) throw new AppError('Venda não encontrada', 404);
  const sale = saleRows[0];

  const itemRows = await db
    .select({ productName: products.name })
    .from(saleItems)
    .leftJoin(products, eq(saleItems.productId, products.id))
    .where(eq(saleItems.saleId, saleId));

  const insts = await db
    .select()
    .from(installments)
    .where(and(eq(installments.saleId, saleId), isNull(installments.deletedAt)))
    .orderBy(asc(installments.installmentNumber));

  const pixRows = await db
    .select({ key: settings.key, value: settings.value })
    .from(settings)
    .where(inArray(settings.key, ['pix_celita', 'pix_marcelo']));

  const pixCelita = pixRows.find(r => r.key === 'pix_celita')?.value ?? '';
  const pixMarcelo = pixRows.find(r => r.key === 'pix_marcelo')?.value ?? '';

  const productNames = itemRows
    .map(i => i.productName)
    .filter(Boolean)
    .join(', ');

  const entryInstallment = insts.find(i => i.installmentNumber === 0) ?? null;
  const regularInstallments = insts.filter(i => i.installmentNumber > 0);

  return { sale, productNames, entryInstallment, regularInstallments, pixCelita, pixMarcelo };
}

// --- HTML builder ---

async function buildCarneHtml(
  data: Awaited<ReturnType<typeof getCarneData>>
): Promise<string> {
  const { sale, productNames, entryInstallment, regularInstallments, pixCelita, pixMarcelo } = data;
  const totalInstallments = regularInstallments.length;

  const allCards: { inst: (typeof regularInstallments)[0]; isEntry: boolean }[] = [];
  if (entryInstallment) allCards.push({ inst: entryInstallment as any, isEntry: true });
  for (const inst of regularInstallments) allCards.push({ inst, isEntry: false });

  const cardHtmls: string[] = [];

  for (const { inst, isEntry } of allCards) {
    const amount = parseFloat(inst.originalAmount.toString());
    let qrHtml = '';

    if (pixCelita && amount > 0) {
      try {
        const payload = buildPixPayload(
          pixCelita,
          amount,
          'AMOR INFINITO ENXOVAIS',
          'JABOTICABAL'
        );
        const dataUrl = await QRCode.toDataURL(payload, {
          width: 72,
          margin: 1,
          errorCorrectionLevel: 'M',
        });
        qrHtml = `<div class="qr-wrap"><img src="${dataUrl}" width="72" height="72"/><div class="qr-lbl">PIX</div></div>`;
      } catch {
        // QR generation is best-effort
      }
    }

    const label = isEntry
      ? 'ENTRADA'
      : `${String(inst.installmentNumber).padStart(2, '0')}/${String(totalInstallments).padStart(2, '0')}`;

    const entryRow =
      !isEntry && entryInstallment
        ? `<tr><td class="lbl">ENTRADA</td><td>${brl(entryInstallment.originalAmount)}</td></tr>`
        : '';

    cardHtmls.push(`
<div class="carne">
  <div class="carne-header">
    <div class="store-name">&#10084; Amor Infinito Enxovais</div>
    <div class="sale-meta"><span>${sale.saleNumber}</span><span>${fmtDate(sale.saleDate)}</span></div>
  </div>

  <div class="highlight">
    <span class="inst-num">${label}</span>
    <span class="inst-val">${brl(amount)}</span>
  </div>

  <table class="info-tbl">
    <tr><td class="lbl">CLIENTE</td><td>${sale.customerName ?? ''}</td></tr>
    <tr><td class="lbl">CPF</td><td>${sale.customerCpf ?? ''}</td></tr>
    <tr><td class="lbl">FONE</td><td>${fmtPhone(sale.customerPhone)}</td></tr>
    <tr><td class="lbl">PRODUTO</td><td class="ellipsis">${productNames}</td></tr>
    ${entryRow}
    <tr><td class="lbl">TOTAL</td><td>${brl(sale.totalAmount)}</td></tr>
    <tr><td class="lbl">VENCIMENTO</td><td><strong>${fmtDate(inst.dueDate)}</strong></td></tr>
  </table>

  <div class="footer">
    <div class="manual">
      <div class="mline"><span class="lsm">Recebido em:</span><span class="fill"></span></div>
      <div class="mline"><span class="lsm">Recebido por:</span><span class="fill"></span></div>
      <div class="mline"><span class="lsm">Valor recebido:</span><span class="fill"></span></div>
      ${pixCelita ? `<div class="pix-txt"><span class="lsm">PIX CELITA:</span> ${pixCelita}</div>` : ''}
      ${pixMarcelo ? `<div class="pix-txt"><span class="lsm">PIX MARCELO:</span> ${pixMarcelo}</div>` : ''}
    </div>
    ${qrHtml}
  </div>
</div>`);
  }

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>
  @page { size: A4; margin: 8mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 8.5px; color: #1a1a1a; }

  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4mm;
  }

  .carne {
    border: 1.5px dashed #999;
    padding: 3mm;
    height: 66mm;
    display: flex;
    flex-direction: column;
    gap: 1.2mm;
    page-break-inside: avoid;
    overflow: hidden;
  }

  .carne-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding-bottom: 1.5mm;
    border-bottom: 1px solid #ddd;
  }
  .store-name { font-size: 10px; font-weight: bold; color: #be123c; }
  .sale-meta { text-align: right; font-size: 7.5px; color: #555; display: flex; flex-direction: column; }

  .highlight {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5mm 0;
  }
  .inst-num { font-size: 21px; font-weight: bold; line-height: 1; }
  .inst-val { font-size: 19px; font-weight: bold; color: #be123c; line-height: 1; }

  .info-tbl { width: 100%; font-size: 7.5px; border-collapse: collapse; }
  .info-tbl td { padding: 0.7px 1.5px; vertical-align: top; }
  .lbl { font-weight: bold; color: #555; white-space: nowrap; width: 56px; }
  .ellipsis { max-width: 120px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }

  .footer {
    margin-top: auto;
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    border-top: 1px solid #ddd;
    padding-top: 1.5mm;
    gap: 2mm;
  }

  .manual { flex: 1; }
  .mline {
    display: flex;
    align-items: baseline;
    gap: 1mm;
    border-bottom: 0.5px solid #bbb;
    margin-bottom: 1.2mm;
    padding-bottom: 1px;
  }
  .fill { flex: 1; }
  .lsm { font-size: 7px; font-weight: bold; white-space: nowrap; color: #555; }
  .pix-txt { font-size: 7px; margin-top: 0.8mm; word-break: break-all; }

  .qr-wrap { text-align: center; flex-shrink: 0; }
  .qr-lbl { font-size: 7px; font-weight: bold; color: #be123c; margin-top: 1px; }
</style>
</head>
<body>
  <div class="grid">
    ${cardHtmls.join('\n')}
  </div>
</body>
</html>`;
}

// --- PDF generation ---

export async function generateCarnePdf(saleId: string): Promise<Buffer> {
  const data = await getCarneData(saleId);
  const html = await buildCarneHtml(data);

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
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
