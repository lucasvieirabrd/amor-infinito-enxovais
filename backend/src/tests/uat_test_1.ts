import { CustomerService } from '../services/customer.service';
import { SaleService } from '../services/sale.service';
import { ProductRepository } from '../repositories/product.repository';
import { db } from '../database';
import { customers, products, sales, saleItems, installments } from '../database/schema';
import { eq } from 'drizzle-orm';

const customerService = new CustomerService();
const saleService = new SaleService();
const productRepo = new ProductRepository();

async function runUAT1() {
  console.log('--- INICIANDO UAT FASE 1: CLIENTES E VENDAS ---');

  const testPhone = '5516996312685';
  const testCpf = '111.222.333-44';
  const testName = 'Cliente Teste UAT';

  try {
    // 1. Limpar dados de teste
    console.log('[1/4] Limpando dados de teste...');
    await db.delete(installments);
    await db.delete(saleItems);
    await db.delete(sales);
    await db.delete(customers).where(eq(customers.phone, testPhone));

    // 2. Cadastrar Cliente Manualmente
    console.log('[2/4] Teste: Cadastro Manual de Cliente...');
    const customerId = await customerService.create({
      name: testName,
      cpf: testCpf,
      phone: testPhone,
      email: 'uat@teste.com',
      addressCep: '14400-000',
      addressStreet: 'Rua Teste',
      addressNumber: '123',
      addressNeighborhood: 'Centro',
      addressCity: 'Franca',
      addressState: 'SP'
    });
    console.log(`- Cliente cadastrado com ID: ${customerId}`);

    // 3. Simular Importação CSV (Lógica de Loop)
    console.log('[3/4] Teste: Simulação de Importação CSV...');
    const csvData = [
      { name: 'Importado 1', cpf: '111.111.111-11', phone: '5516999990001', email: 'imp1@teste.com' },
      { name: 'Importado 2', cpf: '222.222.222-22', phone: '5516999990002', email: 'imp2@teste.com' }
    ];
    for (const item of csvData) {
      await customerService.create(item);
    }
    console.log('- 2 clientes importados com sucesso.');

    // 4. Registrar Venda no Crediário (Entrada + 3 Parcelas)
    console.log('[4/4] Teste: Registro de Venda no Crediário...');
    
    // Garantir que existe um produto para teste
    const testSku = 'SKU-UAT-001';
    let product = await db.query.products.findFirst({ where: eq(products.sku, testSku) });
    if (!product) {
      await db.insert(products).values({
        sku: testSku,
        name: 'Produto Teste UAT',
        price: '100.00',
        stock: 10,
        minStock: 2,
        category: 'Teste'
      });
      product = await db.query.products.findFirst({ where: eq(products.sku, testSku) });
    }

    const saleData = {
      customerId: customerId,
      sellerId: 'system-user', // Simulado
      items: [
        { productId: product!.id, quantity: 2, price: 100.00 }
      ],
      paymentMethod: 'crediario' as const,
      downPayment: 50.00,
      installmentsCount: 3,
      firstDueDate: new Date('2026-05-10'),
      totalAmount: 200.00
    };

    const saleId = await saleService.createSale(saleData);
    console.log(`- Venda registrada com ID: ${saleId}`);

    // Verificar parcelas geradas
    const generatedInstallments = await db.query.installments.findMany({
      where: eq(installments.saleId, saleId)
    });
    console.log(`- Total de parcelas geradas: ${generatedInstallments.length}`);
    generatedInstallments.forEach((inst, idx) => {
      console.log(`  - Parcela ${inst.installmentNumber}: Vencimento ${inst.dueDate}, Valor R$ ${inst.originalAmount}`);
    });

    console.log('\n--- UAT FASE 1 CONCLUÍDA COM SUCESSO! ---');

  } catch (error) {
    console.error('Erro durante o UAT Fase 1:', error);
  } finally {
    process.exit(0);
  }
}

runUAT1();
