import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { 
  FiSearch, FiUser, FiShoppingCart, FiPlus, FiMinus, 
  FiTrash2, FiCreditCard, FiDollarSign, FiCalendar, FiCheckCircle, FiX
} from 'react-icons/fi';
import { Button, Input, Card, Badge, Modal, Loading } from '../../components/ui';
import { format, addMonths } from 'date-fns';

interface Customer {
  id: string;
  name: string;
  cpf: string;
}

interface Product {
  id: string;
  name: string;
  sku: string;
  price: string | number;
  priceDisplay?: string;
  quantity: number;
}

interface CartItem {
  product: Product;
  quantity: number;
}

export const Sales: React.FC = () => {
  const navigate = useNavigate();
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'credit_card' | 'installment'>('cash');
  const [installmentsCount, setInstallmentsCount] = useState(1);
  const [firstDueDate, setFirstDueDate] = useState(format(addMonths(new Date(), 1), 'yyyy-MM-dd'));
  const [downPayment, setDownPayment] = useState(0);
  const [isSuccess, setIsSuccess] = useState(false);

  const queryClient = useQueryClient();

  // Buscar clientes
  const { data: customers } = useQuery({
    queryKey: ['customers-search', customerSearch],
    queryFn: async () => {
      if (customerSearch.length < 2) return [];
      const response = await api.get('/customers', { params: { search: customerSearch } });
      return response.data.data as Customer[];
    },
    enabled: customerSearch.length >= 2,
  });

  // Buscar produtos
  const { data: products } = useQuery({
    queryKey: ['products-search', productSearch],
    queryFn: async () => {
      if (productSearch.length < 2) return [];
      const response = await api.get('/products', { params: { search: productSearch } });
      return response.data.data as Product[];
    },
    enabled: productSearch.length >= 2,
  });

  const addToCart = (product: Product) => {
    const existing = cart.find(item => item.product.id === product.id);
    if (existing) {
      if (existing.quantity >= product.quantity) {
        alert('Estoque insuficiente!');
        return;
      }
      setCart(cart.map(item => 
        item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
      ));
    } else {
      if (product.quantity <= 0) {
        alert('Produto sem estoque!');
        return;
      }
      setCart([...cart, { product, quantity: 1 }]);
    }
    setProductSearch('');
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart(cart.map(item => {
      if (item.product.id === productId) {
        const newQty = item.quantity + delta;
        if (newQty <= 0) return item;
        if (newQty > item.product.quantity) {
          alert('Estoque insuficiente!');
          return item;
        }
        return { ...item, quantity: newQty };
      }
      return item;
    }).filter(item => item.quantity > 0));
  };

  const removeFromCart = (productId: string) => {
    setCart(cart.filter(item => item.product.id !== productId));
  };

  const total = cart.reduce((acc, item) => 
    acc + (parseFloat(item.product.price.toString()) * item.quantity), 0
  );

  const registerSaleMutation = useMutation({
    mutationFn: (saleData: any) => api.post('/sales', saleData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setIsSuccess(true);
      setCart([]);
      setSelectedCustomer(null);
    },
    onError: (err: any) => {
      alert(err.response?.data?.message || 'Erro ao registrar venda');
    }
  });

  const handleFinishSale = () => {
    if (!selectedCustomer) return alert('Selecione um cliente!');
    if (cart.length === 0) return alert('Carrinho vazio!');

    const saleData = {
      customerId: selectedCustomer.id,
      paymentMethod,
      items: cart.map(item => ({
        productId: item.product.id,
        quantity: item.quantity,
        unitPrice: parseFloat(item.product.price.toString()),
      })),
      installmentsCount: paymentMethod === 'installment' ? installmentsCount : undefined,
      saleDate: new Date().toISOString(),
      downPayment: paymentMethod === 'installment' ? downPayment : 0,
      firstDueDate: paymentMethod === 'installment' ? firstDueDate : undefined,
    };

    registerSaleMutation.mutate(saleData);
  };

  if (isSuccess) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-6">
        <div className="p-4 bg-success bg-opacity-10 rounded-full">
          <FiCheckCircle className="text-success" size={64} />
        </div>
        <div className="text-center">
          <h2 className="text-3xl font-bold text-gray-900">Venda Realizada!</h2>
          <p className="text-gray-600 mt-2">O estoque foi atualizado e as parcelas geradas (se crediário).</p>
        </div>
        <Button 
          variant="primary"
          size="lg"
          onClick={() => setIsSuccess(false)}
        >
          Nova Venda
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Vendas</h1>
          <p className="text-gray-600 mt-1">Registre novas vendas e crediários</p>
        </div>
        <Button
          variant="secondary"
          onClick={() => navigate('/sales/history')}
        >
          Ver Histórico
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Customer and Cart */}
        <div className="lg:col-span-2 space-y-6">
          {/* Customer Selection */}
          <Card title="Cliente" subtitle="Selecione o cliente para a venda">
            {!selectedCustomer ? (
              <div className="space-y-3">
                <div className="relative">
                  <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                  <input 
                    type="text"
                    placeholder="Buscar cliente por nome ou CPF..."
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    className="input-base pl-10 w-full"
                  />
                </div>
                {customers && customers.length > 0 && (
                  <div className="border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {customers.map(c => (
                      <button 
                        key={c.id}
                        onClick={() => { setSelectedCustomer(c); setCustomerSearch(''); }}
                        className="w-full text-left px-4 py-3 hover:bg-background border-b last:border-0 transition-colors"
                      >
                        <p className="font-semibold text-gray-900">{c.name}</p>
                        <p className="text-xs text-gray-500">{c.cpf}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between p-4 bg-primary bg-opacity-10 rounded-lg border border-primary border-opacity-20">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center font-bold">
                    {selectedCustomer.name.charAt(0)}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{selectedCustomer.name}</p>
                    <p className="text-xs text-gray-600">{selectedCustomer.cpf}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedCustomer(null)} 
                  className="text-primary hover:text-primary hover:bg-primary hover:bg-opacity-10 p-2 rounded-lg transition-colors"
                >
                  <FiX size={20} />
                </button>
              </div>
            )}
          </Card>

          {/* Shopping Cart */}
          <Card title="Carrinho" subtitle="Produtos adicionados à venda">
            <div className="space-y-4">
              <div className="relative">
                <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                <input 
                  type="text"
                  placeholder="Adicionar produto por nome ou SKU..."
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  className="input-base pl-10 w-full"
                />
              </div>

              {products && products.length > 0 && (
                <div className="border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {products.map(p => (
                    <button 
                      key={p.id}
                      onClick={() => addToCart(p)}
                      className="w-full text-left px-4 py-3 hover:bg-background border-b last:border-0 transition-colors flex justify-between items-center"
                    >
                      <div>
                        <p className="font-semibold text-gray-900">{p.name}</p>
                        <p className="text-xs text-gray-600">SKU: {p.sku} | Estoque: {p.quantity}</p>
                      </div>
                      <p className="font-bold text-primary">R$ {parseFloat(p.price.toString()).toFixed(2)}</p>
                    </button>
                  ))}
                </div>
              )}

              {/* Cart Items */}
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {cart.length === 0 ? (
                  <div className="h-32 flex flex-col items-center justify-center text-gray-400">
                    <FiShoppingCart size={48} className="mb-2" />
                    <p>Carrinho vazio</p>
                  </div>
                ) : (
                  cart.map(item => (
                    <div key={item.product.id} className="flex items-center justify-between p-3 bg-background rounded-lg border border-gray-200 hover:border-primary transition-colors">
                      <div className="flex-1">
                        <p className="font-semibold text-gray-900">{item.product.name}</p>
                        <p className="text-xs text-gray-600">R$ {parseFloat(item.product.price.toString()).toFixed(2)} / un</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center bg-gray-100 rounded-lg px-2">
                          <button 
                            onClick={() => updateQuantity(item.product.id, -1)} 
                            className="p-1 text-gray-600 hover:text-primary transition-colors"
                          >
                            <FiMinus size={14} />
                          </button>
                          <span className="w-8 text-center font-bold text-sm">{item.quantity}</span>
                          <button 
                            onClick={() => updateQuantity(item.product.id, 1)} 
                            className="p-1 text-gray-600 hover:text-primary transition-colors"
                          >
                            <FiPlus size={14} />
                          </button>
                        </div>
                        <p className="w-20 text-right font-bold text-gray-900">
                          R$ {(parseFloat(item.product.price.toString()) * item.quantity).toFixed(2)}
                        </p>
                        <button 
                          onClick={() => removeFromCart(item.product.id)} 
                          className="text-error hover:bg-error hover:bg-opacity-10 p-2 rounded-lg transition-colors"
                        >
                          <FiTrash2 size={18} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </Card>
        </div>

        {/* Right Column: Payment and Summary */}
        <div className="space-y-6">
          {/* Payment Method */}
          <Card title="Pagamento" subtitle="Selecione a forma de pagamento">
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2">
                <button 
                  onClick={() => setPaymentMethod('cash')}
                  className={`p-3 rounded-lg border-2 flex flex-col items-center gap-2 transition-all ${
                    paymentMethod === 'cash' 
                      ? 'border-primary bg-primary bg-opacity-10 text-primary' 
                      : 'border-gray-200 text-gray-400 hover:border-gray-300'
                  }`}
                >
                  <FiDollarSign size={24} />
                  <span className="text-[10px] font-bold uppercase">À Vista</span>
                </button>
                <button 
                  onClick={() => setPaymentMethod('credit_card')}
                  className={`p-3 rounded-lg border-2 flex flex-col items-center gap-2 transition-all ${
                    paymentMethod === 'credit_card' 
                      ? 'border-primary bg-primary bg-opacity-10 text-primary' 
                      : 'border-gray-200 text-gray-400 hover:border-gray-300'
                  }`}
                >
                  <FiCreditCard size={24} />
                  <span className="text-[10px] font-bold uppercase">Cartão</span>
                </button>
                <button 
                  onClick={() => setPaymentMethod('installment')}
                  className={`p-3 rounded-lg border-2 flex flex-col items-center gap-2 transition-all ${
                    paymentMethod === 'installment' 
                      ? 'border-primary bg-primary bg-opacity-10 text-primary' 
                      : 'border-gray-200 text-gray-400 hover:border-gray-300'
                  }`}
                >
                  <FiCalendar size={24} />
                  <span className="text-[10px] font-bold uppercase">Crediário</span>
                </button>
              </div>

              {paymentMethod === 'installment' && (
                <div className="space-y-4 p-4 bg-background rounded-lg border border-gray-200">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-2">Valor de Entrada (opcional)</label>
                    <input 
                      type="number"
                      value={downPayment}
                      onChange={e => setDownPayment(Math.max(0, parseFloat(e.target.value) || 0))}
                      placeholder="0.00"
                      className="input-base w-full"
                      min="0"
                      max={total}
                      step="0.01"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-2">Número de Parcelas</label>
                    <select 
                      value={installmentsCount}
                      onChange={e => setInstallmentsCount(Number(e.target.value))}
                      className="input-base w-full"
                    >
                      {Array.from({length: 30}, (_, i) => i + 1).map(n => (
                        <option key={n} value={n}>{n}x</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-2">1º Vencimento</label>
                    <input 
                      type="date"
                      value={firstDueDate}
                      onChange={e => setFirstDueDate(e.target.value)}
                      className="input-base w-full"
                    />
                  </div>
                  <div className="pt-3 border-t border-gray-200 space-y-2">
                    <div className="flex justify-between text-xs text-gray-600">
                      <span>Total:</span>
                      <span className="font-semibold">R$ {total.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-xs text-gray-600">
                      <span>Entrada:</span>
                      <span className="font-semibold">R$ {downPayment.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-xs text-gray-600">
                      <span>A Financiar:</span>
                      <span className="font-semibold">R$ {(total - downPayment).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm font-bold text-primary pt-2 border-t border-gray-200">
                      <span>Valor da Parcela:</span>
                      <span>R$ {((total - downPayment) / installmentsCount).toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Summary */}
          <Card>
            <div className="space-y-4">
              <div className="flex justify-between items-center text-gray-600">
                <span>Subtotal</span>
                <span>R$ {total.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center text-2xl font-bold text-gray-900 pt-4 border-t border-gray-200">
                <span>Total</span>
                <span className="text-primary">R$ {total.toFixed(2)}</span>
              </div>
              <Button 
                variant="primary"
                size="lg"
                onClick={handleFinishSale}
                loading={registerSaleMutation.isPending}
                disabled={cart.length === 0 || !selectedCustomer}
                className="w-full"
              >
                {registerSaleMutation.isPending ? 'Processando...' : 'Finalizar Venda'}
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
