// NF-e XML parser — layout 4.00 (Receita Federal)
// Accepts both <nfeProc><NFe>... and <NFe>... root elements.
// Returns the same DanfeResult interface used by the PDF parser so
// the rest of the import flow is reused without changes.

import { XMLParser } from 'fast-xml-parser';
import type { DanfeResult, DanfeItem } from './danfe';

const ACCEPTED_CNPJS = ['47401804000166', '38143602000170'];

function parseFloat2(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return parseFloat(v) || 0;
  return 0;
}

export function parseNFeXML(xmlContent: string): DanfeResult {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    // Always treat <det> as array, even when there's only one item
    isArray: (_name, _jpath, _isLeaf, isAttribute) =>
      !isAttribute && _name === 'det',
    parseAttributeValue: true,
    parseTagValue: true,
    trimValues: true,
  });

  const obj = parser.parse(xmlContent);

  // Navigate to infNFe — root can be nfeProc.NFe.infNFe or NFe.infNFe
  const nfe = obj?.nfeProc?.NFe ?? obj?.NFe;
  const infNFe = nfe?.infNFe;

  if (!infNFe) {
    return {
      nfNumber: null, nfSeries: null, supplierName: null, supplierCnpj: null,
      recipientCnpj: null, accessKey: null, nfDate: null, totalProducts: null,
      items: [],
      validationError: 'Estrutura XML inválida: elemento <infNFe> não encontrado.',
    };
  }

  // Access key: Id="NFe<44 digits>" — strip the "NFe" prefix
  const idAttr = String(infNFe['@_Id'] ?? '');
  const accessKey = idAttr.replace(/^NFe/, '').replace(/\D/g, '').substring(0, 44) || null;

  const ide = infNFe.ide ?? {};
  const nfNumber = ide.nNF != null ? String(ide.nNF) : null;
  const nfSeries = ide.serie != null ? String(ide.serie) : null;

  // dhEmi is ISO 8601 with timezone, e.g. "2026-07-16T13:16:15-03:00"
  const dhEmi = String(ide.dhEmi ?? '');
  const nfDate = dhEmi.length >= 10 ? dhEmi.substring(0, 10) : null;

  const emit = infNFe.emit ?? {};
  const supplierCnpj = String(emit.CNPJ ?? '').replace(/\D/g, '') || null;
  const supplierName = emit.xNome != null ? String(emit.xNome) : null;

  const dest = infNFe.dest ?? {};
  const recipientCnpj = String(dest.CNPJ ?? '').replace(/\D/g, '') || null;

  const totalProducts = parseFloat2(infNFe.total?.ICMSTot?.vProd) || null;

  // Normalize det to array (isArray option handles it, but guard anyway)
  const detRaw = infNFe.det;
  const detList: any[] = Array.isArray(detRaw) ? detRaw : detRaw != null ? [detRaw] : [];

  const rawItems: DanfeItem[] = detList
    .map((det: any) => {
      const prod = det?.prod ?? {};
      return {
        code: String(prod.cProd ?? '').trim(),
        description: String(prod.xProd ?? '').trim(),
        ncm: String(prod.NCM ?? '').trim(),
        unit: String(prod.uCom ?? '').trim(),
        quantity: parseFloat2(prod.qCom),
        unitCost: parseFloat2(prod.vUnCom),
        totalCost: parseFloat2(prod.vProd),
      };
    })
    .filter(i => i.code && i.quantity > 0 && i.totalCost > 0);

  // Aggregate by supplier code — some suppliers emit one <det> per unit
  const itemMap = new Map<string, DanfeItem>();
  for (const item of rawItems) {
    const ex = itemMap.get(item.code);
    if (ex) {
      ex.quantity = parseFloat((ex.quantity + item.quantity).toFixed(4));
      ex.totalCost = parseFloat((ex.totalCost + item.totalCost).toFixed(2));
      ex.unitCost = parseFloat((ex.totalCost / ex.quantity).toFixed(4));
    } else {
      itemMap.set(item.code, { ...item });
    }
  }

  const items = Array.from(itemMap.values());

  // Validation: sum of items vs NF total
  let validationError: string | null = null;
  if (totalProducts !== null && items.length > 0) {
    const parsedTotal = items.reduce((sum, i) => sum + i.totalCost, 0);
    const diff = Math.abs(parsedTotal - totalProducts);
    if (diff > 0.10) {
      validationError = `Soma dos itens (R$ ${parsedTotal.toFixed(2)}) difere do total da NF (R$ ${totalProducts.toFixed(2)}) em R$ ${diff.toFixed(2)}`;
    }
  }

  // Recipient CNPJ check (warning only — does not block)
  let cnpjWarning: string | null = null;
  if (recipientCnpj && !ACCEPTED_CNPJS.includes(recipientCnpj)) {
    cnpjWarning = `O CNPJ do destinatário (${recipientCnpj}) não corresponde às lojas cadastradas.`;
  }

  return {
    nfNumber,
    nfSeries,
    supplierName,
    supplierCnpj,
    recipientCnpj,
    accessKey,
    nfDate,
    totalProducts,
    items,
    validationError: validationError ?? cnpjWarning,
  };
}
