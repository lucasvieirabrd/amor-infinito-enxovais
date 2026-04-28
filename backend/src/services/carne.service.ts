import puppeteer from 'puppeteer';
import QRCode from 'qrcode';
import { format } from 'date-fns';
import { eq, and, isNull, inArray, asc } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';
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

// --- Logo (PNG file → base64 data URI) ---

const logoPath = path.join(__dirname, '../assets/logo-amor-infinito.png.jpeg');
const logoBase64 = fs.readFileSync(logoPath).toString('base64');
const logoSrc = `data:image/jpeg;base64,${logoBase64}`;

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

    // QR Code — uses pix_qrcode (UUID key) for more reliable static QR with amount
    let qrHtml = '';
    if (pixQrcode && amount > 0) {
      try {
        const payload = buildPixPayload(pixQrcode, amount, 'AMOR INFINITO ENXOVAIS', 'JABOTICABAL');
        const dataUrl = await QRCode.toDataURL(payload, { width: 80, margin: 1, errorCorrectionLevel: 'M' });
        qrHtml = `<div class="qr-wrap"><img class="qr-img" src="${dataUrl}" alt="PIX"/><span class="qr-label">Pague com QRCODE</span></div>`;
      } catch {
        // best-effort
      }
    }

    // BLOCO 2 labels
    const isEntrada   = isEntry;
    const numText     = isEntrada
      ? 'ENTRADA'
      : `${String(inst.installmentNumber).padStart(2, '0')}/${String(totalInstallments).padStart(2, '0')}`;
    const numFontSize = isEntrada ? '32px' : '34px';
    const numSublabel = isEntrada ? '' : 'PARCELA';
    const amtSublabel = isEntrada ? 'VALOR ENTRADA' : 'VALOR PARCELA';

    // BLOCO 3: ENTRADA+TOTAL row (only on regular cards when sale has entry)
    const entradaRow = (!isEntrada && entryInstallment)
      ? `<div class="dr"><b>ENTRADA:</b>&nbsp;${brl(entryInstallment.originalAmount)}&nbsp;&nbsp;<b>TOTAL VENDA:</b>&nbsp;${brl(sale.totalAmount)}</div>`
      : `<div class="dr"><b>TOTAL VENDA:</b>&nbsp;${brl(sale.totalAmount)}</div>`;

    // Truncate product name at 35 chars
    const product = productNames.length > 35 ? productNames.slice(0, 35) + '…' : productNames;

    cardHtmls.push(`<div class="carne">

  <div class="b1">
    <img class="logo" src="${logoSrc}" alt="Amor Infinito Enxovais"/>
    <div class="b1r"><div>Venda: <strong>${sale.saleNumber}</strong></div><div>Data: ${fmtDate(sale.saleDate)}</div></div>
  </div>

  <div class="b2">
    <div class="b2l">
      <span class="b2-num" style="font-size:${numFontSize}">${numText}</span>
      ${numSublabel ? `<span class="b2-sub">${numSublabel}</span>` : ''}
    </div>
    <div class="b2r">
      <span class="b2-amt">${brl(amount)}</span>
      <span class="b2-sub">${amtSublabel}</span>
    </div>
  </div>

  <div class="b3">
    <div class="dr"><b>CLIENTE:</b>&nbsp;${sale.customerName ?? ''}</div>
    <div class="dr"><b>CPF:</b>&nbsp;${sale.customerCpf ?? ''}&nbsp;&nbsp;&nbsp;<b>FONE:</b>&nbsp;${fmtPhone(sale.customerPhone)}</div>
    <div class="dr"><b>PRODUTO:</b>&nbsp;${product}</div>
    ${entradaRow}
    <div class="dr"><b>DATA VENCIMENTO:</b>&nbsp;<span class="due">${fmtDate(inst.dueDate)}</span></div>
  </div>

  <div class="b4">
    <div class="b4l">
      <div class="rl"><span class="rll">Recebido em:</span><span class="rlfill"></span></div>
      <div class="rl"><span class="rll">Recebido por:</span><span class="rlfill"></span></div>
      <div class="rl"><span class="rll">Valor recebido: R$</span><span class="rlfill"></span></div>
      ${pixCelita  ? `<div class="pt"><b>PIX CELITA:</b> ${pixCelita}</div>`  : ''}
      ${pixMarcelo ? `<div class="pt"><b>PIX MARCELO:</b> ${pixMarcelo}</div>` : ''}
    </div>
    ${qrHtml}
  </div>

</div>`);
  }

  const css = `
  @page { size: A4; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; background: #fff; }

  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 3mm;
  }

  /* ── Card shell: height fixed so exactly 4 rows fit per A4 page ── */
  .carne {
    border: 1px dashed #aaa;
    padding: 2mm;
    display: flex;
    flex-direction: column;
    gap: 1mm;
    background: #fff;
    page-break-inside: avoid;
  }

  /* BLOCO 1 — Header */
  .b1 {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #ddd;
    padding-bottom: 1mm;
  }
  .logo { height: 38px; width: auto; }
  .b1r { text-align: right; font-size: 9px; color: #333; line-height: 1.6; }
  .b1r strong { font-weight: bold; }

  /* BLOCO 2 — Destaque Principal */
  .b2 {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    border-bottom: 1px solid #ddd;
    padding-bottom: 1mm;
  }
  .b2l { display: flex; flex-direction: column; }
  .b2-num { font-weight: 900; color: #111; line-height: 1; }
  .b2-sub { font-size: 8px; color: #666; letter-spacing: 1px; margin-top: 2px; }
  .b2r { display: flex; flex-direction: column; align-items: flex-end; }
  .b2-amt { font-size: 26px; font-weight: 900; color: #e53e3e; line-height: 1; }

  /* BLOCO 3 — Dados */
  .b3 {
    font-size: 8.5px;
    border-bottom: 1px solid #ddd;
    padding-bottom: 1mm;
  }
  .dr {
    display: flex;
    align-items: baseline;
    white-space: nowrap;
    overflow: hidden;
    line-height: 1;
    margin-bottom: 1.5px;
  }
  .dr:last-child { margin-bottom: 0; }
  .dr b { font-weight: bold; flex-shrink: 0; }
  .due { color: #e53e3e; font-weight: bold; }

  /* BLOCO 4 — Rodapé */
  .b4 {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 2mm;
    flex: 1;
  }
  .b4l { flex: 1; min-width: 0; }
  .rl {
    display: flex;
    align-items: baseline;
    gap: 1mm;
    border-bottom: 0.5px solid #ccc;
    margin-bottom: 2px;
    padding-bottom: 0.5px;
  }
  .rll { font-size: 8px; white-space: nowrap; flex-shrink: 0; line-height: 1.8; }
  .rlfill { flex: 1; }
  .pt { font-size: 8px; line-height: 1.8; word-break: break-all; }
  .pt b { font-weight: bold; }

  .qr-wrap { display: flex; flex-direction: column; align-items: center; gap: 1mm; flex-shrink: 0; }
  .qr-img { width: 70px; height: 70px; }
  .qr-label { font-size: 7.5px; font-weight: bold; color: #333; white-space: nowrap; }
  `;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><style>${css}</style></head>
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
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '5mm', bottom: '5mm', left: '5mm', right: '5mm' },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
