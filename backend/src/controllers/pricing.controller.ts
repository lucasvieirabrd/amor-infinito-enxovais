import { Request, Response } from 'express';
import { z } from 'zod';
import { PricingService } from '../services/pricing.service';
import { calcProduct, calcFactor, PricingParams } from '../utils/pricingFormulas';
import { AppError } from '../utils/AppError';

const pricingService = new PricingService();

const calcItemSchema = z.object({
  name: z.string().min(1),
  unitCost: z.number().positive(),
  assembly: z.number().min(0).default(0),
  installmentsCount: z.number().int().min(1).max(60).default(10),
  imposto: z.number().optional(),
});

const calcRequestSchema = z.object({
  code: z.string().min(1),
  totalProducts: z.number().optional(),
  totalNf: z.number().optional(),
  freight: z.number().min(0).default(0),
  items: z.array(calcItemSchema).min(1),
  supplier: z.string().optional(),
  nfNumber: z.string().optional(),
});

const paramsSchema = z.object({
  code: z.string().min(1),
  params: z.object({
    imposto: z.number().optional(),
    comissao_vendedores_crediario: z.number().optional(),
    comissao_marcelo_celita_crediario: z.number().optional(),
    comissao_vendedores_avista: z.number().optional(),
    comissao_marcelo_celita_avista: z.number().optional(),
    custos_fixos: z.number().optional(),
    calote: z.number().optional(),
    multiplicador_crediario: z.number().optional(),
    lucro_desejado_avista_cartao: z.number().optional(),
    taxa_cartao_1x: z.number().optional(),
    taxa_cartao_parcelado: z.number().optional(),
    mostrar_lucro_para_marcelo: z.boolean().optional(),
  }),
});

export class PricingController {
  async validate(req: Request, res: Response) {
    const { code } = z.object({ code: z.string().min(1) }).parse(req.body);
    const valid = await pricingService.validateCode(code);
    if (!valid) return res.status(403).json({ error: 'Código inválido' });
    const params = await pricingService.getParams();
    return res.json({ valid: true, params });
  }

  async calculate(req: Request, res: Response) {
    const parsed = calcRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Dados inválidos' });
    }
    const { code, totalProducts, totalNf, freight, items, supplier, nfNumber } = parsed.data;

    const valid = await pricingService.validateCode(code);
    if (!valid) return res.status(403).json({ error: 'Código inválido' });

    const params = await pricingService.getParams();
    const factor = calcFactor(totalProducts ?? null, totalNf ?? null, freight);

    const results = items.map(item => ({
      name: item.name,
      unitCost: item.unitCost,
      assembly: item.assembly,
      installmentsCount: item.installmentsCount,
      ...calcProduct(params, {
        unitCost: item.unitCost,
        assembly: item.assembly,
        installmentsCount: item.installmentsCount,
        factor,
        imposto: item.imposto,
      }),
    }));

    return res.json({ factor, results, params });
  }

  async saveHistory(req: Request, res: Response) {
    const parsed = calcRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Dados inválidos' });
    }
    const { code, totalProducts, totalNf, freight, items, supplier, nfNumber } = parsed.data;

    const valid = await pricingService.validateCode(code);
    if (!valid) return res.status(403).json({ error: 'Código inválido' });

    const params = await pricingService.getParams();
    const factor = calcFactor(totalProducts ?? null, totalNf ?? null, freight);

    const historyItems = items.map(item => {
      const r = calcProduct(params, {
        unitCost: item.unitCost,
        assembly: item.assembly,
        installmentsCount: item.installmentsCount,
        factor,
        imposto: item.imposto,
      });
      return {
        name: item.name,
        unitCost: item.unitCost,
        assembly: item.assembly,
        installmentsCount: item.installmentsCount,
        realCost: r.realCost,
        priceCredit: r.priceCredit,
        priceCash: r.priceCash,
        priceCard1x: r.priceCard1x,
        priceCard10x: r.priceCard10x,
        profitCredit: r.profitCredit,
        profitCash: r.profitCash,
      };
    });

    const id = await pricingService.saveHistory({
      code,
      supplier,
      nfNumber,
      totalProducts,
      totalNf,
      freight,
      factor,
      paramsSnapshot: params,
      items: historyItems,
    });

    return res.status(201).json({ id });
  }

  async getHistory(req: Request, res: Response) {
    const { code, search, from, to, limit, offset } = req.query as Record<string, string>;
    if (!code) return res.status(403).json({ error: 'Código obrigatório' });

    const valid = await pricingService.validateCode(code);
    if (!valid) return res.status(403).json({ error: 'Código inválido' });

    const rows = await pricingService.getHistory({
      search,
      from,
      to,
      limit: limit ? Number(limit) : 30,
      offset: offset ? Number(offset) : 0,
    });
    return res.json(rows);
  }

  async getHistoryDetail(req: Request, res: Response) {
    const { id } = req.params;
    const { code } = req.query as { code: string };
    if (!code) return res.status(403).json({ error: 'Código obrigatório' });

    const valid = await pricingService.validateCode(code);
    if (!valid) return res.status(403).json({ error: 'Código inválido' });

    const detail = await pricingService.getHistoryDetail(id);
    return res.json(detail);
  }

  async updateParams(req: Request, res: Response) {
    const parsed = paramsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Dados inválidos' });
    }
    const { code, params } = parsed.data;
    const valid = await pricingService.validateCode(code);
    if (!valid) return res.status(403).json({ error: 'Código inválido' });

    await pricingService.updateParams(params as Partial<PricingParams>);
    return res.json({ success: true });
  }

  async updateAccessCode(req: Request, res: Response) {
    const { currentCode, newCode } = z.object({
      currentCode: z.string().min(1),
      newCode: z.string().min(4),
    }).parse(req.body);

    const valid = await pricingService.validateCode(currentCode);
    if (!valid) return res.status(403).json({ error: 'Código atual inválido' });

    await pricingService.updateAccessCode(newCode);
    return res.json({ success: true });
  }
}
