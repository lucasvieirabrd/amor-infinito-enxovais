import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { 
  FiSearch, FiUser, FiShoppingCart, FiPlus, FiMinus, 
  FiTrash2, FiCreditCard, FiDollarSign, FiCalendar, FiCheckCircle 
} from 'react-icons/fi';
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
  quantity: number;
}

interface CartItem {
  product: Product;
  quantity: number;
}

export const Sales: React.FC = () => {
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'credit_card' | 'installment'>('cash');
  const [installmentsCount, setInstallmentsCount] = useState(1);
  const [firstDueDate, setFirstDueDate] = useState(format(addMonths(new Date(), 1), 'yyyy-MM-dd'));
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
      // Aqui poderíamos enviar parcelas personalizadas se necessário
    };

    registerSaleMutation.mutate(saleData);
  };

  if (isSuccess) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-6">
        <div className="p-4 bg-green-100 text-green-600 rounded-full">
          <FiCheckCircle size={64} />
        </div>
        <div className="text-center">
          <h2 className="text-3xl font-bold text-gray-800">Venda Realizada!</h2>
          <p className="text-gray-600 mt-2">O estoque foi atualizado e as parcelas geradas (se crediário).</p>
        </div>
        <button 
          onClick={() => setIsSuccess(false)}
          className="btn-primary"
        >
          Nova Venda
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 h-[calc(100vh-160px)]">
      {/* Coluna da Esquerda: Seleção e Carrinho */}
      <div className="lg:col-span-2 space-y-6 flex flex-col">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 space-y-4">
          <h3 className="text-lg font-bold text-gray-800 flex items-center">
            <FiUser className="mr-2" /> Cliente
          </h3>
          {!selectedCustomer ? (
            <div className="relative">
              <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input 
                type="text"
                placeholder="Buscar cliente por nome ou CPF..."
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-primary-500 focus:border-primary-500"
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
              />
              {customers && customers.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {customers.map(c => (
                    <button 
                      key={c.id}
                      onClick={() => { setSelectedCustomer(c); setCustomerSearch(''); }}
                      className="w-full text-left px-4 py-2 hover:bg-gray-50 text-sm border-b last:border-0"
                    >
                      <p className="font-bold text-gray-800">{c.name}</p>
                      <p className="text-xs text-gray-500">{c.cpf}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between p-3 bg-primary-50 rounded-lg border border-primary-100">
              <div className="flex items-center">
                <div className="h-10 w-10 rounded-full bg-primary-600 text-white flex items-center justify-center font-bold mr-3">
                  {selectedCustomer.name.charAt(0)}
                </div>
                <div>
                  <p className="font-bold text-primary-900">{selectedCustomer.name}</p>
                  <p className="text-xs text-primary-700">{selectedCustomer.cpf}</p>
                </div>
              </div>
              <button onClick={() => setSelectedCustomer(null)} className="text-primary-600 hover:text-primary-800">
                <FiTrash2 size={18} />
              </button>
            </div>
          )}
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex-1 flex flex-col">
          <h3 className="text-lg font-bold text-gray-800 flex items-center mb-4">
            <FiShoppingCart className="mr-2" /> Carrinho
          </h3>
          
          <div className="relative mb-4">
            <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input 
              type="text"
              placeholder="Adicionar produto por nome ou SKU..."
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-primary-500 focus:border-primary-500"
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
            />
            {products && products.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {products.map(p => (
                  <button 
                    key={p.id}
                    onClick={() => addToCart(p)}
                    className="w-full text-left px-4 py-2 hover:bg-gray-50 text-sm border-b last:border-0 flex justify-between items-center"
                  >
                    <div>
                      <p className="font-bold text-gray-800">{p.name}</p>
                      <p className="text-xs text-gray-500">SKU: {p.sku} | Estoque: {p.quantity}</p>
                    </div>
                    <p className="font-bold text-primary-600">R$ {parseFloat(p.price.toString()).toFixed(2)}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto space-y-3">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-400 opacity-50">
                <FiShoppingCart size={48} className="mb-2" />
                <p>Carrinho vazio</p>
              </div>
            ) : cart.map(item => (
              <div key={item.product.id} className="flex items-center justify-between p-3 border border-gray-100 rounded-lg hover:bg-gray-50">
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-800 truncate">{item.product.name}</p>
                  <p className="text-xs text-gray-500">R$ {parseFloat(item.product.price.toString()).toFixed(2)} / un</p>
                </div>
                <div className="flex items-center gap-4 ml-4">
                  <div className="flex items-center bg-gray-100 rounded-lg px-2">
                    <button onClick={() => updateQuantity(item.product.id, -1)} className="p-1 text-gray-600 hover:text-primary-600"><FiMinus size={14} /></button>
                    <span className="w-8 text-center font-bold text-sm">{item.quantity}</span>
                    <button onClick={() => updateQuantity(item.product.id, 1)} className="p-1 text-gray-600 hover:text-primary-600"><FiPlus size={14} /></button>
                  </div>
                  <p className="w-20 text-right font-bold text-gray-800">
                    R$ {(parseFloat(item.product.price.toString()) * item.quantity).toFixed(2)}
                  </p>
                  <button onClick={() => removeFromCart(item.product.id)} className="text-red-400 hover:text-red-600">
                    <FiTrash2 size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Coluna da Direita: Pagamento e Resumo */}
      <div className="space-y-6 flex flex-col">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex-1 flex flex-col">
          <h3 className="text-lg font-bold text-gray-800 mb-6">Pagamento</h3>
          
          <div className="grid grid-cols-3 gap-3 mb-8">
            <button 
              onClick={() => setPaymentMethod('cash')}
              className={`p-3 rounded-lg border-2 flex flex-col items-center gap-2 transition-all ${
                paymentMethod === 'cash' ? 'border-primary-600 bg-primary-50 text-primary-600' : 'border-gray-100 text-gray-400'
              }`}
            >
              <FiDollarSign size={24} />
              <span className="text-[10px] font-bold uppercase">À Vista</span>
            </button>
            <button 
              onClick={() => setPaymentMethod('credit_card')}
              className={`p-3 rounded-lg border-2 flex flex-col items-center gap-2 transition-all ${
                paymentMethod === 'credit_card' ? 'border-primary-600 bg-primary-50 text-primary-600' : 'border-gray-100 text-gray-400'
              }`}
            >
              <FiCreditCard size={24} />
              <span className="text-[10px] font-bold uppercase">Cartão</span>
            </button>
            <button 
              onClick={() => setPaymentMethod('installment')}
              className={`p-3 rounded-lg border-2 flex flex-col items-center gap-2 transition-all ${
                paymentMethod === 'installment' ? 'border-primary-600 bg-primary-50 text-primary-600' : 'border-gray-100 text-gray-400'
              }`}
            >
              <FiCalendar size={24} />
              <span className="text-[10px] font-bold uppercase">Crediário</span>
            </button>
          </div>

          {paymentMethod === 'installment' && (
            <div className="space-y-4 mb-8 p-4 bg-gray-50 rounded-lg border border-gray-100 animate-fadeIn">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Parcelas</label>
                <select 
                  className="w-full border-gray-200 rounded-md text-sm"
                  value={installmentsCount}
                  onChange={e => setInstallmentsCount(Number(e.target.value))}
                >
                  {[1,2,3,4,5,6,7,8,9,10,12].map(n => (
                    <option key={n} value={n}>{n}x</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">1º Vencimento</label>
                <input 
                  type="date"
                  className="w-full border-gray-200 rounded-md text-sm"
                  value={firstDueDate}
                  onChange={e => setFirstDueDate(e.target.value)}
                />
              </div>
              <div className="pt-2 border-t border-gray-200">
                <p className="text-xs text-gray-500">Valor da Parcela:</p>
                <p className="text-lg font-bold text-primary-600">R$ {(total / installmentsCount).toFixed(2)}</p>
              </div>
            </div>
          )}

          <div className="mt-auto space-y-4">
            <div className="flex justify-between items-center text-gray-500">
              <span>Subtotal</span>
              <span>R$ {total.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center text-2xl font-bold text-gray-800">
              <span>Total</span>
              <span>R$ {total.toFixed(2)}</span>
            </div>
            <button 
              onClick={handleFinishSale}
              disabled={registerSaleMutation.isPending || cart.length === 0 || !selectedCustomer}
              className="w-full btn-primary py-4 text-lg"
            >
              {registerSaleMutation.isPending ? 'Processando...' : 'Finalizar Venda'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
