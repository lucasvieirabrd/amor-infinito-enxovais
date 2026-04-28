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
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value));
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
    .where(inArray(settings.key, ['pix_celita', 'pix_marcelo', 'pix_qrcode']));

  const pixCelita  = pixRows.find(r => r.key === 'pix_celita')?.value  ?? '';
  const pixMarcelo = pixRows.find(r => r.key === 'pix_marcelo')?.value ?? '';
  // pix_qrcode is used for the QR code EMV payload (random key is more reliable for static QR)
  const pixQrcode  = pixRows.find(r => r.key === 'pix_qrcode')?.value  ?? pixCelita;

  const productNames = itemRows.map(i => i.productName).filter(Boolean).join(', ');
  const entryInstallment    = insts.find(i => i.installmentNumber === 0) ?? null;
  const regularInstallments = insts.filter(i => i.installmentNumber > 0);

  return { sale, productNames, entryInstallment, regularInstallments, pixCelita, pixMarcelo, pixQrcode };
}

// --- HTML builder ---

async function buildCarneHtml(
  data: Awaited<ReturnType<typeof getCarneData>>
): Promise<string> {
  const { sale, productNames, entryInstallment, regularInstallments, pixCelita, pixMarcelo, pixQrcode } = data;
  const totalInstallments = regularInstallments.length;

  const allCards: { inst: (typeof regularInstallments)[0]; isEntry: boolean }[] = [];
  if (entryInstallment) allCards.push({ inst: entryInstallment as any, isEntry: true });
  for (const inst of regularInstallments) allCards.push({ inst, isEntry: false });

  const cardHtmls: string[] = [];

  for (const { inst, isEntry } of allCards) {
    const amount = parseFloat(inst.originalAmount.toString());

    // QR code uses pix_qrcode key (random UUID key → more reliable for static QR with amount)
    let qrHtml = '';
    if (pixQrcode && amount > 0) {
      try {
        const payload = buildPixPayload(pixQrcode, amount, 'AMOR INFINITO ENXOVAIS', 'JABOTICABAL');
        const dataUrl = await QRCode.toDataURL(payload, {
          width: 70,
          margin: 1,
          errorCorrectionLevel: 'M',
        });
        qrHtml = `
          <div class="c-qr">
            <img src="${dataUrl}" width="70" height="70" alt="PIX QR Code"/>
            <div class="c-qr-lbl">Pague com QRCODE</div>
          </div>`;
      } catch {
        // QR generation is best-effort
      }
    }

    // Installment number label — "ENTRADA" for entry card, "01/12" for regular
    const instLabel    = isEntry
      ? 'ENTRADA'
      : `${String(inst.installmentNumber).padStart(2, '0')}/${String(totalInstallments).padStart(2, '0')}`;
    const instSubLabel = isEntry ? '' : 'PARCELA';
    const valSubLabel  = isEntry ? 'VALOR ENTRADA' : 'VALOR PARCELA';

    // "ENTRADA: R$X | TOTAL VENDA: R$Y" shown on regular cards when sale has entry
    const entryTotalRow = (!isEntry && entryInstallment)
      ? `<div class="r">
           <b>ENTRADA:</b>&nbsp;${brl(entryInstallment.originalAmount)}
           &nbsp;&nbsp;<b>TOTAL VENDA:</b>&nbsp;${brl(sale.totalAmount)}
         </div>`
      : `<div class="r"><b>TOTAL VENDA:</b>&nbsp;${brl(sale.totalAmount)}</div>`;

    // "ENTRADA" label sits narrower at 28px; number pair "01/12" can use 36px
    const numFontSize = isEntry ? '28px' : '36px';

    cardHtmls.push(`
<div class="carne">

  <div class="c-header">
    <div class="c-logo">&#10084; Amor Infinito Enxovais</div>
    <div class="c-meta"><strong>${sale.saleNumber}</strong><br>${fmtDate(sale.saleDate)}</div>
  </div>

  <div class="c-highlight">
    <div class="c-num-block">
      <div class="c-num" style="font-size:${numFontSize}">${instLabel}</div>
      ${instSubLabel ? `<div class="c-num-sub">${instSubLabel}</div>` : ''}
    </div>
    <div class="c-amnt-block">
      <div class="c-amnt">${brl(amount)}</div>
      <div class="c-amnt-sub">${valSubLabel}</div>
    </div>
  </div>

  <div class="c-info">
    <div class="r"><b>CLIENTE:</b>&nbsp;<span class="ell">${sale.customerName ?? ''}</span></div>
    <div class="r"><b>CPF:</b>&nbsp;${sale.customerCpf ?? ''}&nbsp;&nbsp;&nbsp;<b>FONE:</b>&nbsp;${fmtPhone(sale.customerPhone)}</div>
    <div class="r"><b>PRODUTO:</b>&nbsp;<span class="ell">${productNames}</span></div>
    ${entryTotalRow}
    <div class="r"><b>VENCIMENTO:</b>&nbsp;<span class="c-due">${fmtDate(inst.dueDate)}</span></div>
  </div>

  <div class="c-footer">
    <div class="c-receipt">
      <div class="fl"><span class="rl">Recebido em:</span><span class="fline"></span></div>
      <div class="fl"><span class="rl">Recebido por:</span><span class="fline"></span></div>
      <div class="fl"><span class="rl">Valor recebido: R$</span><span class="fline"></span></div>
      ${pixCelita  ? `<div class="pix"><b>PIX CELITA:</b> ${pixCelita}</div>`  : ''}
      ${pixMarcelo ? `<div class="pix"><b>PIX MARCELO:</b> ${pixMarcelo}</div>` : ''}
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
  body { font-family: Arial, Helvetica, sans-serif; font-size: 8px; color: #111; background: #fff; }

  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4mm;
  }

  /* ── Card shell ── */
  .carne {
    border: 1px dashed #aaa;
    padding: 3mm 3.5mm;
    display: flex;
    flex-direction: column;
    gap: 1.8mm;
    page-break-inside: avoid;
    background: #fff;
    overflow: hidden;
  }

  /* ── Header ── */
  .c-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding-bottom: 1.5mm;
    border-bottom: 1px solid #ddd;
  }
  .c-logo {
    font-size: 9.5px;
    font-weight: bold;
    color: #be123c;
    line-height: 1.3;
  }
  .c-meta {
    text-align: right;
    font-size: 7px;
    color: #555;
    line-height: 1.5;
  }

  /* ── Highlight row (big number + big value) ── */
  .c-highlight {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    padding: 0.5mm 0;
    border-bottom: 1px solid #eee;
  }
  .c-num-block  { display: flex; flex-direction: column; }
  .c-num        { font-weight: bold; line-height: 1; color: #111; }
  .c-num-sub    { font-size: 6.5px; font-weight: bold; color: #777; text-transform: uppercase; letter-spacing: 0.4px; margin-top: 1px; }
  .c-amnt-block { display: flex; flex-direction: column; align-items: flex-end; }
  .c-amnt       { font-size: 28px; font-weight: bold; line-height: 1; color: #be123c; }
  .c-amnt-sub   { font-size: 6.5px; font-weight: bold; color: #777; text-transform: uppercase; letter-spacing: 0.4px; margin-top: 1px; }

  /* ── Client info block ── */
  .c-info {
    font-size: 7.5px;
    line-height: 1;
    border-bottom: 1px solid #eee;
    padding-bottom: 1.5mm;
  }
  .r {
    display: flex;
    align-items: baseline;
    flex-wrap: nowrap;
    overflow: hidden;
    white-space: nowrap;
    margin-bottom: 1.1mm;
  }
  .r:last-child { margin-bottom: 0; }
  .r b  { font-weight: bold; color: #333; flex-shrink: 0; }
  .ell  { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  .c-due { font-weight: bold; color: #be123c; }

  /* ── Footer (receipt lines + QR) ── */
  .c-footer {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 2mm;
  }
  .c-receipt { flex: 1; min-width: 0; }
  .fl {
    display: flex;
    align-items: baseline;
    gap: 1mm;
    border-bottom: 0.5px solid #bbb;
    margin-bottom: 1.2mm;
    padding-bottom: 0.5px;
  }
  .rl    { font-size: 7px; font-weight: bold; color: #333; white-space: nowrap; flex-shrink: 0; }
  .fline { flex: 1; }
  .pix   { font-size: 6.5px; color: #444; margin-top: 0.8mm; word-break: break-all; line-height: 1.3; }
  .pix b { font-weight: bold; color: #333; }

  .c-qr     { text-align: center; flex-shrink: 0; }
  .c-qr-lbl { font-size: 6px; font-weight: bold; color: #be123c; margin-top: 1px; white-space: nowrap; }
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
