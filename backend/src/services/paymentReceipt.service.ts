import { db } from '../database';
import { sql } from 'drizzle-orm';
import { AppError } from '../utils/AppError';
import { launchBrowser } from '../utils/puppeteerLaunch';
import { numberToWords } from './promissoria.service';
import { format } from 'date-fns';
import fs from 'fs';
import path from 'path';

// --- Logo ---

const possibleLogoPaths = [
  path.join(__dirname, '../assets/logo-amor-infinito.jpeg'),
  path.join(__dirname, '../../src/assets/logo-amor-infinito.jpeg'),
  path.join(process.cwd(), 'src/assets/logo-amor-infinito.jpeg'),
  path.join(process.cwd(), 'dist/assets/logo-amor-infinito.jpeg'),
];
let logoSrc = '';
for (const p of possibleLogoPaths) {
  if (fs.existsSync(p)) {
    const logoBase64 = fs.readFileSync(p).toString('base64');
    logoSrc = `data:image/jpeg;base64,${logoBase64}`;
    break;
  }
}

// --- Formatters ---

function brl(v: number | string): string {
  const n = Number(v);
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  const [intPart, decPart = '00'] = abs.toFixed(2).split('.');
  const formatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${sign}R$ ${formatted},${decPart}`;
}

function fmtDate(date: Date | string | null): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  return format(d, 'dd/MM/yyyy');
}

const MONTHS_PT = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

function fullDatePt(date: Date): string {
  return `${date.getDate()} de ${MONTHS_PT[date.getMonth()]} de ${date.getFullYear()}`;
}

// --- Data fetch ---

async function fetchReceiptData(installmentId: string) {
  const [rows, balanceRows, nowRows] = await Promise.all([
    db.execute(sql`
      SELECT
        i.id,
        i.installment_number,
        i.original_amount,
        i.paid_amount,
        DATE(CONVERT_TZ(i.payment_date, '+00:00', '-03:00')) AS payment_date_sp,
        i.status,
        i.sale_id,
        c.name    AS customer_name,
        c.cpf     AS customer_cpf,
        r.ren_number,
        r.new_amount  AS agreement_total,
        r.installments_count
      FROM installments i
      INNER JOIN customers      c ON i.customer_id = c.id
      INNER JOIN renegotiations r ON i.sale_id     = r.id
      WHERE i.id = ${installmentId}
        AND i.deleted_at IS NULL
      LIMIT 1
    `),
    db.execute(sql`
      SELECT
        COALESCE(SUM(i.original_amount - COALESCE(i.paid_amount, 0)), 0) AS remaining
      FROM installments i
      WHERE i.sale_id = (
        SELECT sale_id FROM installments WHERE id = ${installmentId} LIMIT 1
      )
        AND i.installment_number > 0
        AND i.deleted_at IS NULL
        AND i.status NOT IN ('paid', 'canceled')
    `),
    db.execute(sql`
      SELECT DATE_FORMAT(CONVERT_TZ(NOW(), '+00:00', '-03:00'), '%d/%m/%Y %H:%i') AS now_sp
    `),
  ]);

  const row = (rows[0] as unknown as any[])[0];
  if (!row) throw new AppError('Parcela não encontrada ou não pertence a um acordo de renegociação', 404);
  if (row.status !== 'paid') throw new AppError('Apenas parcelas pagas podem ter recibo gerado', 400);

  const remaining = Number((balanceRows[0] as unknown as any[])[0]?.remaining ?? 0);
  const nowSp = (nowRows[0] as unknown as any[])[0]?.now_sp as string;

  return {
    installmentNumber: Number(row.installment_number),
    installmentsCount: Number(row.installments_count),
    paidAmount: Number(row.paid_amount ?? row.original_amount),
    paymentDateSp: row.payment_date_sp as string,
    customerName: String(row.customer_name ?? ''),
    customerCpf: String(row.customer_cpf ?? ''),
    renNumber: String(row.ren_number),
    agreementTotal: Number(row.agreement_total),
    remaining,
    nowSp,
  };
}

// --- HTML builder ---

function buildHtml(d: Awaited<ReturnType<typeof fetchReceiptData>>): string {
  const paymentDate = new Date(d.paymentDateSp + 'T12:00:00');
  const today = new Date();

  const logoHtml = logoSrc
    ? `<img src="${logoSrc}" style="height:50px;width:auto" alt="Amor Infinito Enxovais" />`
    : `<span style="font-size:16px;font-weight:bold;color:#be123c">&#10084; Amor Infinito Enxovais</span>`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>
  @page { size: A4; margin: 20mm 18mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #111; background: #fff; }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 2px solid #be123c;
    padding-bottom: 8px;
    margin-bottom: 12px;
  }
  .company-name { font-size: 13px; font-weight: bold; color: #be123c; }
  .company-detail { font-size: 9px; color: #555; margin-top: 2px; line-height: 1.6; }
  .doc-title {
    font-size: 20px;
    font-weight: 900;
    letter-spacing: 3px;
    text-align: right;
    color: #111;
  }
  .doc-subtitle { font-size: 9px; text-align: right; color: #666; margin-top: 3px; }

  .receipt-body {
    border: 2px solid #222;
    border-radius: 4px;
    padding: 16px 20px;
    margin-bottom: 14px;
    line-height: 2;
    font-size: 11.5px;
  }
  .receipt-body strong { font-weight: bold; }
  .amount-highlight {
    font-size: 17px;
    font-weight: 900;
    color: #111;
  }

  .summary-box {
    background: #f9f9f9;
    border: 1px solid #ddd;
    border-radius: 4px;
    padding: 12px 16px;
    margin-bottom: 14px;
  }
  .summary-box .title {
    font-size: 10px;
    font-weight: bold;
    letter-spacing: 1.5px;
    color: #555;
    text-transform: uppercase;
    border-bottom: 1px solid #ddd;
    padding-bottom: 5px;
    margin-bottom: 8px;
  }
  .summary-row {
    display: flex;
    justify-content: space-between;
    padding: 2px 0;
    font-size: 11px;
  }
  .summary-row.balance {
    font-size: 13px;
    font-weight: bold;
    color: #be123c;
    border-top: 1px solid #ddd;
    margin-top: 6px;
    padding-top: 6px;
  }

  .location-row {
    text-align: right;
    font-size: 11px;
    margin-bottom: 18px;
    color: #333;
  }

  .sig-section {
    margin-top: 14px;
    display: flex;
    justify-content: center;
  }
  .sig-block {
    text-align: center;
    width: 240px;
  }
  .sig-line {
    border-top: 1px solid #333;
    padding-top: 5px;
    font-size: 10px;
    color: #444;
  }
  .sig-sublabel { font-size: 9px; color: #666; margin-top: 2px; }

  .footer {
    margin-top: 20px;
    border-top: 1px solid #ddd;
    padding-top: 5px;
    font-size: 8.5px;
    color: #999;
    text-align: center;
  }
</style>
</head>
<body>

  <div class="header">
    <div>
      ${logoHtml}
      <div class="company-name">AMOR INFINITO ENXOVAIS LTDA</div>
      <div class="company-detail">
        CNPJ: 47.401.804/0001-66<br>
        Rua Fortunato Frasca, 691 – Jardim das Rosas<br>
        Jaboticabal/SP – CEP 14871-800
      </div>
    </div>
    <div>
      <div class="doc-title">RECIBO</div>
      <div class="doc-subtitle">DE PAGAMENTO</div>
      <div class="doc-subtitle" style="margin-top:4px">Acordo ${d.renNumber}</div>
    </div>
  </div>

  <div class="receipt-body">
    Recebemos de <strong>${d.customerName}</strong>, CPF ${d.customerCpf || '—'},
    a quantia de <span class="amount-highlight">${brl(d.paidAmount)}</span>
    (${numberToWords(d.paidAmount)}), referente ao pagamento da
    <strong>parcela ${d.installmentNumber} de ${d.installmentsCount}</strong>
    do acordo de renegociação <strong>${d.renNumber}</strong>,
    pago em <strong>${fmtDate(paymentDate)}</strong>.
  </div>

  <div class="summary-box">
    <div class="title">Resumo do Acordo</div>
    <div class="summary-row">
      <span>Valor total negociado</span>
      <span>${brl(d.agreementTotal)}</span>
    </div>
    <div class="summary-row">
      <span>Quantidade de parcelas</span>
      <span>${d.installmentsCount}</span>
    </div>
    <div class="summary-row">
      <span>Parcela paga</span>
      <span>${d.installmentNumber} / ${d.installmentsCount}</span>
    </div>
    <div class="summary-row balance">
      <span>Saldo devedor restante</span>
      <span>${brl(d.remaining)}</span>
    </div>
  </div>

  <div class="location-row">
    Jaboticabal, ${fullDatePt(paymentDate)}
  </div>

  <div class="sig-section">
    <div class="sig-block">
      <div class="sig-line">AMOR INFINITO ENXOVAIS LTDA</div>
      <div class="sig-sublabel">Celita Vieira da Silva — Representante</div>
    </div>
  </div>

  <div class="footer">
    Recibo gerado em ${d.nowSp} · ${d.renNumber} · Parcela ${d.installmentNumber}/${d.installmentsCount}
  </div>

</body>
</html>`;
}

// --- PDF generation ---

export async function generatePaymentReceiptPdf(installmentId: string): Promise<{
  pdf: Buffer;
  customerName: string;
  installmentNumber: number;
  paymentDateSp: string;
}> {
  const data = await fetchReceiptData(installmentId);
  const html = buildHtml(data);

  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({ format: 'A4', printBackground: true });
    return {
      pdf: Buffer.from(pdf),
      customerName: data.customerName,
      installmentNumber: data.installmentNumber,
      paymentDateSp: data.paymentDateSp,
    };
  } finally {
    await browser.close();
  }
}
