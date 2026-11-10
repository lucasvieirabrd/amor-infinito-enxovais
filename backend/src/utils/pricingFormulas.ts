export interface PricingParams {
  imposto: number;
  comissao_vendedores_crediario: number;
  comissao_marcelo_celita_crediario: number;
  comissao_vendedores_avista: number;
  comissao_marcelo_celita_avista: number;
  custos_fixos: number;
  calote: number;
  multiplicador_crediario: number;
  lucro_desejado_avista_cartao: number;
  taxa_cartao_1x: number;
  taxa_cartao_parcelado: number;
  mostrar_lucro_para_marcelo: boolean;
}

export const DEFAULT_PARAMS: PricingParams = {
  imposto: 0.083,
  comissao_vendedores_crediario: 0.05,
  comissao_marcelo_celita_crediario: 0.05,
  comissao_vendedores_avista: 0.05,
  comissao_marcelo_celita_avista: 0.05,
  custos_fixos: 0.20,
  calote: 0.05,
  multiplicador_crediario: 3,
  lucro_desejado_avista_cartao: 0.20,
  taxa_cartao_1x: 0.03,
  taxa_cartao_parcelado: 0.10,
  mostrar_lucro_para_marcelo: true,
};

/** Arredonda pra cima terminando em 9. Ex: 547.02 → 549 */
export function arred9(x: number): number {
  return Math.ceil((x + 1) / 10) * 10 - 1;
}

export interface ProductCalcInput {
  unitCost: number;
  assembly: number;
  installmentsCount: number;
  factor: number;
  imposto?: number; // override do parâmetro salvo (campo editável na tela)
}

export interface ProductCalcResult {
  realCost: number;
  priceCredit: number;
  installmentValue: number;
  profitCredit: number;
  profitCreditPct: number;
  priceCash: number;
  profitCash: number;
  profitCashPct: number;
  priceCard1x: number;
  priceCard10x: number;
  discountPct: number;
  divisorValid: boolean;
}

export function calcProduct(params: PricingParams, input: ProductCalcInput): ProductCalcResult {
  const { unitCost, assembly, installmentsCount, factor } = input;
  const imposto = input.imposto ?? params.imposto;

  const realCost = unitCost * factor;

  // Crediário
  const acrescimo = params.comissao_vendedores_crediario + params.comissao_marcelo_celita_crediario;
  const priceCredit = arred9(realCost * params.multiplicador_crediario * (1 + acrescimo) + assembly);
  const installmentValue = priceCredit / installmentsCount;
  const baseCred = priceCredit - assembly;
  const profitCredit =
    baseCred * (1 - imposto - params.custos_fixos - params.calote) -
    baseCred * params.comissao_vendedores_crediario -
    baseCred * params.comissao_marcelo_celita_crediario -
    realCost;
  const profitCreditPct = baseCred > 0 ? profitCredit / baseCred : 0;

  // À vista
  const divisor =
    1 -
    imposto -
    params.comissao_vendedores_avista -
    params.comissao_marcelo_celita_avista -
    params.custos_fixos -
    params.lucro_desejado_avista_cartao;

  const divisorCard1x = divisor - params.taxa_cartao_1x;
  const divisorCard10x = divisor - params.taxa_cartao_parcelado;
  const divisorValid = divisor > 0 && divisorCard1x > 0 && divisorCard10x > 0;

  const priceCash = divisorValid ? arred9(realCost / divisor + assembly) : 0;
  const baseAv = priceCash - assembly;
  const profitCash = divisorValid
    ? baseAv * (1 - imposto - params.custos_fixos) -
      baseAv * (params.comissao_vendedores_avista + params.comissao_marcelo_celita_avista) -
      realCost
    : 0;
  const profitCashPct = baseAv > 0 ? profitCash / baseAv : 0;

  const priceCard1x = divisorValid ? arred9(realCost / divisorCard1x + assembly) : 0;
  const priceCard10x = divisorValid ? arred9(realCost / divisorCard10x + assembly) : 0;

  const discountPct = priceCredit > 0 ? 1 - priceCash / priceCredit : 0;

  return {
    realCost,
    priceCredit,
    installmentValue,
    profitCredit,
    profitCreditPct,
    priceCash,
    profitCash,
    profitCashPct,
    priceCard1x,
    priceCard10x,
    discountPct,
    divisorValid,
  };
}

export function calcFactor(totalProducts: number | null, totalNf: number | null, freight: number): number {
  if (!totalProducts || totalProducts <= 0) return 1;
  const nfValue = totalNf && totalNf > 0 ? totalNf : totalProducts;
  return (nfValue + freight) / totalProducts;
}
