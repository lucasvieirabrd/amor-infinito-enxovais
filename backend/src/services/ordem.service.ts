import puppeteer from 'puppeteer';
import { format } from 'date-fns';
import { eq, and, isNull, asc } from 'drizzle-orm';
import { db } from '../database';
import { sales, saleItems, installments, customers, products, sellers } from '../database/schema';
import { AppError } from '../utils/AppError';
import fs from 'fs';
import path from 'path';

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
  return local.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3') || rawPhone;
}

function esc(str: string): string {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// --- Logo ---

const possiblePaths = [
  path.join(__dirname, '../assets/logo-amor-infinito.jpeg'),
  path.join(__dirname, '../../src/assets/logo-amor-infinito.jpeg'),
  path.join(process.cwd(), 'src/assets/logo-amor-infinito.jpeg'),
  path.join(process.cwd(), 'dist/assets/logo-amor-infinito.jpeg'),
];
let logoSrc = '';
for (const p of possiblePaths) {
  if (fs.existsSync(p)) {
    logoSrc = `data:image/jpeg;base64,${fs.readFileSync(p).toString('base64')}`;
    break;
  }
}
const logoFallbackSvg = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="40">',
  '<text x="1" y="30" font-family="Arial,sans-serif" font-size="30" fill="#e53e3e">&#x2665;</text>',
  '<text x="40" y="18" font-family="Arial,sans-serif" font-size="12" font-weight="bold" fill="#be123c">AMOR INFINITO</text>',
  '<text x="40" y="33" font-family="Arial,sans-serif" font-size="9" fill="#888" letter-spacing="1">ENXOVAIS</text>',
  '</svg>',
].join('');
const logoFallbackSrc = `data:image/svg+xml;base64,${Buffer.from(logoFallbackSvg).toString('base64')}`;

// --- Data fetching ---

async function getOrdemData(saleId: string) {
  const rows = await db
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
      customerAddressStreet: customers.addressStreet,
      customerAddressNumber: customers.addressNumber,
      customerAddressNeighborhood: customers.addressNeighborhood,
      customerAddressCity: customers.addressCity,
      customerAddressState: customers.addressState,
      customerCep: customers.cep,
      sellerName: sellers.name,
    })
    .from(sales)
    .leftJoin(customers, eq(sales.customerId, customers.id))
    .leftJoin(sellers, eq(sales.sellerId, sellers.id))
    .where(and(eq(sales.id, saleId), isNull(sales.deletedAt)))
    .limit(1);

  if (rows.length === 0) throw new AppError('Venda não encontrada', 404);
  const sale = rows[0];

  const itemRows = await db
    .select({
      sku: products.sku,
      productName: products.name,
      quantity: saleItems.quantity,
      unitPrice: saleItems.unitPrice,
      totalPrice: saleItems.totalPrice,
    })
    .from(saleItems)
    .leftJoin(products, eq(saleItems.productId, products.id))
    .where(eq(saleItems.saleId, saleId));

  const insts = await db
    .select()
    .from(installments)
    .where(and(eq(installments.saleId, saleId), isNull(installments.deletedAt)))
    .orderBy(asc(installments.installmentNumber));

  const entryInstallment = insts.find(i => i.installmentNumber === 0) ?? null;
  const regularInstallments = insts.filter(i => i.installmentNumber > 0);

  return { sale, itemRows, entryInstallment, regularInstallments };
}

// --- HTML builder ---

function buildOrdemHtml(data: Awaited<ReturnType<typeof getOrdemData>>): string {
  const { sale, itemRows, entryInstallment, regularInstallments } = data;

  const now = new Date();
  const emissaoDateTime = format(now, "dd/MM/yyyy', 'HH:mm:ss");
  const emissaoDate = fmtDate(now);

  // Customer address assembly
  const addrLine1 = [
    sale.customerAddressStreet,
    sale.customerAddressNumber ? `nº ${sale.customerAddressNumber}` : null,
    sale.customerAddressNeighborhood,
  ].filter(Boolean).join(', ');

  const addrLine2 = [
    sale.customerAddressCity && sale.customerAddressState
      ? `${sale.customerAddressCity} - ${sale.customerAddressState}`
      : sale.customerAddressCity || sale.customerAddressState || null,
    sale.customerCep ? `CEP ${sale.customerCep}` : null,
  ].filter(Boolean).join(' — ');

  // Products table rows
  const productRows = itemRows.map((item, i) => {
    const rowBg = i % 2 === 0 ? '#fff' : '#f9fafb';
    return `
      <tr style="background:${rowBg}">
        <td class="td-center">${esc(item.sku || '—')}</td>
        <td>${esc(item.productName || 'Produto')}</td>
        <td class="td-center">${item.quantity}</td>
        <td class="td-right">${brl(item.unitPrice)}</td>
        <td class="td-right">${brl(item.totalPrice)}</td>
      </tr>`;
  }).join('');

  // Installments list
  const totalInstallments = regularInstallments.length;
  const hasEntry = !!entryInstallment;

  let parcelamentoInfo = '';
  if (sale.paymentMethod === 'installment') {
    if (totalInstallments > 0) {
      const instValue = brl(regularInstallments[0].originalAmount);
      parcelamentoInfo = `${totalInstallments}x de ${instValue}`;
      if (hasEntry) parcelamentoInfo += ` + entrada de ${brl(entryInstallment!.originalAmount)}`;
    }
  } else if (sale.paymentMethod === 'cash') {
    parcelamentoInfo = 'À vista';
  } else if (sale.paymentMethod === 'credit_card') {
    parcelamentoInfo = 'Cartão de crédito';
  }

  const instLines: string[] = [];

  if (hasEntry) {
    const ed = fmtDate(entryInstallment!.dueDate);
    const ea = brl(entryInstallment!.originalAmount);
    instLines.push(`<div class="inst-row"><span class="inst-label">Entrada</span><span class="inst-date">${ed}</span><span class="inst-amt">${ea}</span></div>`);
  }

  for (const inst of regularInstallments) {
    const num = String(inst.installmentNumber).padStart(2, '0');
    const d = fmtDate(inst.dueDate);
    const a = brl(inst.originalAmount);
    instLines.push(`<div class="inst-row"><span class="inst-label">${num}</span><span class="inst-date">${d}</span><span class="inst-amt">${a}</span></div>`);
  }

  const installmentsSection = (sale.paymentMethod === 'installment' && instLines.length > 0)
    ? `
      <div class="section">
        <div class="section-title">PARCELAS</div>
        <div class="parc-info">${esc(parcelamentoInfo)}</div>
        <div class="inst-list">${instLines.join('')}</div>
      </div>`
    : `
      <div class="section">
        <div class="section-title">FORMA DE PAGAMENTO</div>
        <div class="parc-info">${esc(parcelamentoInfo)}</div>
      </div>`;

  const css = `
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 11px;
      color: #1a1a1a;
      background: #fff;
      padding: 12mm 14mm 10mm;
    }

    /* ── Header ── */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding-bottom: 6mm;
      border-bottom: 2px solid #be123c;
      margin-bottom: 6mm;
    }
    .header-left { display: flex; align-items: center; gap: 8px; }
    .logo { height: 44px; width: auto; }
    .company-info { font-size: 9px; color: #555; line-height: 1.7; }
    .company-info strong { font-size: 11px; color: #1a1a1a; display: block; font-weight: bold; }
    .header-right { text-align: right; }
    .doc-title {
      font-size: 22px;
      font-weight: 900;
      letter-spacing: 3px;
      color: #be123c;
      line-height: 1;
    }
    .doc-number { font-size: 16px; font-weight: bold; color: #1a1a1a; margin-top: 3px; }
    .doc-date { font-size: 9px; color: #777; margin-top: 4px; }

    /* ── Sections ── */
    .section { margin-bottom: 5mm; }
    .section-title {
      font-size: 9px;
      font-weight: bold;
      letter-spacing: 1.5px;
      color: #be123c;
      text-transform: uppercase;
      border-bottom: 1px solid #e5e7eb;
      padding-bottom: 1.5mm;
      margin-bottom: 3mm;
    }

    /* ── Client box ── */
    .client-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 2mm 8mm;
      font-size: 10.5px;
      line-height: 1.8;
    }
    .client-field { display: flex; flex-direction: column; }
    .client-label { font-size: 8.5px; color: #888; font-weight: bold; letter-spacing: 0.5px; line-height: 1; }
    .client-value { color: #1a1a1a; }
    .client-full { grid-column: 1 / -1; }

    /* ── Products table ── */
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10.5px;
    }
    thead tr { background: #be123c; }
    thead th {
      color: #fff;
      font-weight: bold;
      padding: 4px 7px;
      text-align: left;
      font-size: 9.5px;
      letter-spacing: 0.3px;
    }
    td { padding: 4px 7px; border-bottom: 1px solid #f1f5f9; }
    .td-center { text-align: center; }
    .td-right { text-align: right; }

    /* ── Total ── */
    .total-row {
      display: flex;
      justify-content: flex-end;
      align-items: center;
      gap: 8px;
      margin-top: 3mm;
      padding: 3mm 7px;
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 4px;
    }
    .total-label { font-size: 12px; font-weight: bold; color: #555; }
    .total-value { font-size: 22px; font-weight: 900; color: #be123c; }

    /* ── Installments ── */
    .parc-info { font-size: 11px; font-weight: bold; color: #374151; margin-bottom: 3mm; }
    .inst-list { display: flex; flex-direction: column; gap: 1mm; }
    .inst-row {
      display: flex;
      align-items: baseline;
      gap: 0;
      font-size: 10.5px;
      font-family: 'Courier New', Courier, monospace;
      line-height: 1.7;
      border-bottom: 1px dotted #e5e7eb;
    }
    .inst-row:last-child { border-bottom: none; }
    .inst-label { width: 52px; font-weight: bold; flex-shrink: 0; }
    .inst-date { flex: 1; color: #555; }
    .inst-amt { font-weight: bold; color: #1a1a1a; }

    /* ── Footer ── */
    .footer {
      margin-top: 8mm;
      padding-top: 3mm;
      border-top: 1px solid #e5e7eb;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .footer-left { font-size: 9px; color: #999; }
    .sig-area { text-align: center; }
    .sig-line {
      border-top: 1px solid #555;
      width: 160px;
      padding-top: 2mm;
      font-size: 9px;
      color: #555;
    }
  `;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><style>${css}</style></head>
<body>

  <!-- Header -->
  <div class="header">
    <div class="header-left">
      <img class="logo" src="${logoSrc || logoFallbackSrc}" alt="Amor Infinito Enxovais">
      <div class="company-info">
        <strong>AMOR INFINITO ENXOVAIS LTDA</strong>
        CNPJ: 47.401.804/0001-66<br>
        Rua Fortunato Frasca, 691, Jaboticabal - SP<br>
        CEP 14.875-320
      </div>
    </div>
    <div class="header-right">
      <div class="doc-title">ORDEM DE VENDA</div>
      <div class="doc-number">${esc(sale.saleNumber)}</div>
      <div class="doc-date">Data da venda: ${fmtDate(sale.saleDate)}</div>
      ${sale.sellerName ? `<div class="doc-date">Vendedor: ${esc(sale.sellerName)}</div>` : ''}
    </div>
  </div>

  <!-- Cliente -->
  <div class="section">
    <div class="section-title">Dados do Cliente</div>
    <div class="client-grid">
      <div class="client-field client-full">
        <span class="client-label">NOME</span>
        <span class="client-value">${esc(sale.customerName ?? '')}</span>
      </div>
      <div class="client-field">
        <span class="client-label">CPF</span>
        <span class="client-value">${esc(sale.customerCpf ?? '—')}</span>
      </div>
      <div class="client-field">
        <span class="client-label">TELEFONE</span>
        <span class="client-value">${esc(fmtPhone(sale.customerPhone))}</span>
      </div>
      ${addrLine1 ? `
      <div class="client-field client-full">
        <span class="client-label">ENDEREÇO</span>
        <span class="client-value">${esc(addrLine1)}</span>
      </div>` : ''}
      ${addrLine2 ? `
      <div class="client-field client-full">
        <span class="client-label">CIDADE / CEP</span>
        <span class="client-value">${esc(addrLine2)}</span>
      </div>` : ''}
    </div>
  </div>

  <!-- Produtos -->
  <div class="section">
    <div class="section-title">Produtos</div>
    <table>
      <thead>
        <tr>
          <th style="width:80px">Cód.</th>
          <th>Descrição</th>
          <th style="width:60px" class="td-center">Qtd.</th>
          <th style="width:100px" class="td-right">Preço Unit.</th>
          <th style="width:100px" class="td-right">Subtotal</th>
        </tr>
      </thead>
      <tbody>
        ${productRows || '<tr><td colspan="5" style="text-align:center;color:#999;padding:8px">Sem itens</td></tr>'}
      </tbody>
    </table>

    <!-- Total -->
    <div class="total-row">
      <span class="total-label">TOTAL:</span>
      <span class="total-value">${brl(sale.totalAmount)}</span>
    </div>
  </div>

  <!-- Parcelas / Pagamento -->
  ${installmentsSection}

  <!-- Rodapé -->
  <div class="footer">
    <div class="footer-left">
      Emitido em: ${emissaoDateTime}
    </div>
    <div class="sig-area">
      <div class="sig-line">Assinatura do Cliente</div>
    </div>
  </div>

</body>
</html>`;
}

// --- PDF generation ---

export async function generateOrdemPdf(saleId: string): Promise<Buffer> {
  const data = await getOrdemData(saleId);
  const html = buildOrdemHtml(data);

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
