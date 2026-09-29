import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import axios from 'axios';

// ─── API base (sem interceptor de 401→login) ────────────────────────────────
const API = axios.create({
  baseURL: (import.meta.env.VITE_API_URL as string) || 'http://localhost:3000/api',
});

// ─── Constantes ──────────────────────────────────────────────────────────────

const CITIES = [
  'Jaboticabal',
  'Barrinha',
  'Bebedouro',
  'Borborema',
  'Cândido Rodrigues',
  'Cravinhos',
  'Dobrada',
  'Dumont',
  'Fernando Prestes',
  'Guariba',
  'Guatapará',
  'Monte Alto',
  'Pitangueiras',
  'Pradópolis',
  'Santa Ernestina',
  'Sertãozinho',
  'Taiúva',
  'Tabatinga',
  'Taquaritinga',
  'Vista Alegre do Alto',
  'Outras cidades',
];

const PAYMENT_LABELS: Record<string, string> = {
  avista:    'À vista',
  cartao:    'Cartão',
  crediario: 'Crediário',
};

// ─── Date helpers (UTC puro — sem toLocaleString timezone) ──────────────────

function dateToStr(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function strToUTC(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

function getDOW(s: string): number { // 0=Dom
  return strToUTC(s).getUTCDay();
}

function todayStr(): string {
  return dateToStr(new Date(Date.now()));
}

// "Hoje" no fuso de São Paulo (UTC−3) — sem toLocaleString com timezone
function todaySPStr(): string {
  const sp = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return `${sp.getUTCFullYear()}-${String(sp.getUTCMonth() + 1).padStart(2, '0')}-${String(sp.getUTCDate()).padStart(2, '0')}`;
}

function fmtDisplayDateLong(s: string): string {
  const days = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  const months = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const d = strToUTC(s);
  return `${days[d.getUTCDay()]}, ${d.getUTCDate()} de ${months[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
}

function getTimeSlots(dateStr: string, city: string): string[] {
  const dow = getDOW(dateStr);
  if (dow === 0) return [];

  const pad = (n: number) => String(n).padStart(2, '0');
  const slot = (h: number, m: number) => `${pad(h)}:${pad(m)}`;

  if (dow === 6) {
    // Sábado: 09:00–11:30 (sem almoço — encerra ao meio-dia)
    const s: string[] = [];
    for (let h = 9; h <= 11; h++) { s.push(slot(h, 0)); s.push(slot(h, 30)); }
    return s;
  }

  // Dias úteis (seg–sex): manhã 09:00–11:30 + tarde 13:30–endH:00
  // 12:00 / 12:30 / 13:00 removidos (almoço)
  const endH = dow === 5 ? 18 : (city === 'Jaboticabal' ? 17 : 16);

  const s: string[] = [];
  for (let h = 9; h <= 11; h++) { s.push(slot(h, 0)); s.push(slot(h, 30)); }
  s.push(slot(13, 30));
  for (let h = 14; h <= endH; h++) {
    s.push(slot(h, 0));
    if (h < endH) s.push(slot(h, 30));
  }
  return s;
}

// ─── Mini Calendar ────────────────────────────────────────────────────────────

interface CalendarProps {
  selected: string;
  onSelect: (d: string) => void;
  blockedDates: Set<string>;
}

const MONTH_NAMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const DOW_LABELS = ['D','S','T','Q','Q','S','S'];

const MiniCalendar: React.FC<CalendarProps> = ({ selected, onSelect, blockedDates }) => {
  const todaySP = todaySPStr();
  const initDate = selected || todaySP;
  const [year, setYear] = useState(() => Number(initDate.split('-')[0]));
  const [month, setMonth] = useState(() => Number(initDate.split('-')[1]) - 1);

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  };

  const firstDay = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  const cellStr = (day: number) => `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  const isDisabled = (ds: string) => {
    if (ds <= todaySP) return true;   // hoje e passado bloqueados — mínimo é amanhã SP
    if (getDOW(ds) === 0) return true;
    return blockedDates.has(ds);
  };

  return (
    <div className="select-none">
      <div className="flex items-center justify-between mb-3">
        <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-600">◀</button>
        <span className="font-semibold text-gray-900">{MONTH_NAMES[month]} {year}</span>
        <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-600">▶</button>
      </div>
      <div className="grid grid-cols-7 mb-1">
        {DOW_LABELS.map((l, i) => (
          <div key={i} className={`text-center text-xs font-medium py-1 ${i === 0 ? 'text-red-400' : 'text-gray-500'}`}>{l}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((day, i) => {
          if (!day) return <div key={i} />;
          const ds = cellStr(day);
          const disabled = isDisabled(ds);
          const isSelected = ds === selected;
          const isToday = ds === todaySP;
          return (
            <button key={i} onClick={() => !disabled && onSelect(ds)} disabled={disabled}
              className={`aspect-square flex items-center justify-center rounded-full text-sm font-medium transition-colors
                ${isSelected ? 'bg-primary text-white'
                  : disabled ? 'text-gray-300 cursor-not-allowed'
                  : isToday ? 'border-2 border-primary text-primary hover:bg-primary hover:text-white'
                  : 'text-gray-700 hover:bg-gray-100'}`}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ─── Masks ────────────────────────────────────────────────────────────────────

function maskPhone(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 10) return d.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3').replace(/-$/, '');
  return d.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3').replace(/-$/, '');
}

function maskCPF(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  return d.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, '$1.$2.$3-$4').replace(/-$/, '');
}

function maskCEP(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 8);
  return d.replace(/(\d{5})(\d{0,3})/, '$1-$2').replace(/-$/, '');
}

/** Máscara dd/MM/aaaa para data de nascimento */
function maskBirthDate(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

/** Valida dd/MM/aaaa: data completa, válida e no passado */
function validateBirthDate(v: string): string | null {
  if (!v || v.length < 10) return 'Data incompleta';
  const [dd, mm, yyyy] = v.split('/').map(Number);
  if (!dd || !mm || !yyyy || yyyy < 1900 || yyyy > 9999) return 'Data inválida';
  const d = new Date(Date.UTC(yyyy, mm - 1, dd, 12));
  if (d.getUTCDate() !== dd || d.getUTCMonth() !== mm - 1 || d.getUTCFullYear() !== yyyy) return 'Data inválida';
  if (d >= new Date()) return 'Data deve ser no passado';
  return null;
}

/** Formata dd/MM/aaaa para exibição no WhatsApp */
function fmtBirthForMsg(v: string) {
  return v; // já está em dd/MM/aaaa
}

function fmtPrice(v: number): string {
  const [int, dec] = v.toFixed(2).split('.');
  return `R$ ${int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${dec}`;
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Seller { id: string; name: string; code: string }
interface HolidayEntry { date: string; description: string }
interface ProductEntry { name: string; price: number; description: string | null }

interface FormData {
  // Customer
  customerName:      string;
  customerPhone:     string;
  customerCPF:       string;
  customerBirthDate: string; // dd/MM/aaaa
  customerCEP:       string; // 00000-000
  customerStreet:    string;
  customerNumber:    string;
  customerNeighborhood: string;
  customerCity:      string;
  customerComplement: string;
  customerWorkplace: string;
  // Product
  product: string;
  // Payment
  paymentType:      'avista' | 'cartao' | 'crediario' | '';
  installments:     string;
  installmentValue: string;
  downPaymentDate:  string; // YYYY-MM-DD
  firstDueDate:     string; // YYYY-MM-DD
  // Delivery
  city:         string;
  deliveryDate: string;
  deliveryTime: string;
}

const EMPTY_FORM: FormData = {
  customerName: '', customerPhone: '', customerCPF: '', customerBirthDate: '',
  customerCEP: '', customerStreet: '', customerNumber: '', customerNeighborhood: '',
  customerCity: '', customerComplement: '', customerWorkplace: '',
  product: '',
  paymentType: '', installments: '', installmentValue: '', downPaymentDate: '', firstDueDate: '',
  city: '', deliveryDate: '', deliveryTime: '',
};

export const OrderForm: React.FC = () => {
  const [code, setCode]               = useState('');
  const [seller, setSeller]           = useState<Seller | null>(null);
  const [codeError, setCodeError]     = useState('');
  const [codeLoading, setCodeLoading] = useState(false);

  const [form, setForm]     = useState<FormData>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});

  const [cepLoading, setCepLoading] = useState(false);
  const [cepError, setCepError]     = useState('');

  const [holidays, setHolidays]         = useState<Set<string>>(new Set());
  const [holidayDesc, setHolidayDesc]   = useState<Record<string, string>>({});

  const [allProducts, setAllProducts]         = useState<ProductEntry[]>([]);
  const [productLoading, setProductLoading]   = useState(false);
  const [productSearch, setProductSearch]     = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<ProductEntry | null>(null);
  const [showProductList, setShowProductList] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [bookedSlots, setBookedSlots]       = useState<Set<string>>(new Set());
  const [slotsLoading, setSlotsLoading]     = useState(false);
  const [reserving, setReserving]           = useState(false);
  const [reserveError, setReserveError]     = useState('');

  const [waUrl, setWaUrl]                   = useState('');   // não-vazio = reserva ok
  const [waSent, setWaSent]                 = useState(false); // true = vendedor tocou em "Abrir WA"
  const [photoInstructions, setPhotoInstructions] = useState(false);

  const photoInputRef = useRef<HTMLInputElement>(null);

  // Load holidays when seller confirmed
  useEffect(() => {
    if (!seller) return;
    API.get<HolidayEntry[]>('/order-form/holidays').then(r => {
      const s = new Set<string>();
      const desc: Record<string, string> = {};
      r.data.forEach(h => { s.add(h.date); desc[h.date] = h.description; });
      setHolidays(s);
      setHolidayDesc(desc);
    }).catch(() => {});
  }, [seller]);

  // Load products when seller confirmed
  useEffect(() => {
    if (!seller) { setAllProducts([]); setSelectedProduct(null); setProductSearch(''); setDebouncedSearch(''); return; }
    setProductLoading(true);
    API.get<ProductEntry[]>(`/order-form/products?code=${encodeURIComponent(seller.code)}`)
      .then(r => setAllProducts(r.data))
      .catch(() => setAllProducts([]))
      .finally(() => setProductLoading(false));
  }, [seller]);

  const filteredProducts = useMemo(() => {
    if (!debouncedSearch.trim()) return allProducts;
    const q = debouncedSearch.toLowerCase();
    return allProducts.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.description && p.description.toLowerCase().includes(q))
    );
  }, [allProducts, debouncedSearch]);

  const handleProductSearch = (v: string) => {
    setProductSearch(v);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => setDebouncedSearch(v), 300);
  };

  // Load booked slots when date changes (recarrega p/ refletir reservas recentes)
  useEffect(() => {
    if (!seller || !form.deliveryDate) { setBookedSlots(new Set()); return; }
    setSlotsLoading(true);
    API.get<string[]>(`/order-form/booked-slots?date=${form.deliveryDate}&code=${encodeURIComponent(seller.code)}`)
      .then(r => {
        const s = new Set(r.data);
        setBookedSlots(s);
        // Se o horário já selecionado foi reservado por outro, limpa
        setForm(f => s.has(f.deliveryTime) ? { ...f, deliveryTime: '' } : f);
      })
      .catch(() => setBookedSlots(new Set()))
      .finally(() => setSlotsLoading(false));
  }, [seller, form.deliveryDate]);

  // Reset time when date/city changes
  useEffect(() => {
    setForm(f => ({ ...f, deliveryTime: '' }));
  }, [form.deliveryDate, form.city]);

  const validateCode = async () => {
    if (!code.trim()) { setCodeError('Informe o código'); return; }
    setCodeLoading(true);
    setCodeError('');
    try {
      const res = await API.get<Omit<Seller, 'code'>>(`/order-form/seller?code=${encodeURIComponent(code.toUpperCase())}`);
      setSeller({ ...res.data, code: code.toUpperCase() });
    } catch (e: any) {
      setCodeError(e.response?.data?.error ?? 'Código inválido');
    } finally {
      setCodeLoading(false);
    }
  };

  const set = (field: keyof FormData, value: string) => {
    setForm(f => ({ ...f, [field]: value }));
    setErrors(e => ({ ...e, [field]: undefined }));
  };

  // ViaCEP lookup — mesma lógica do cadastro de clientes
  const handleCepChange = async (value: string) => {
    const formatted = maskCEP(value);
    set('customerCEP', formatted);
    setCepError('');
    const digits = formatted.replace(/\D/g, '');
    if (digits.length === 8) {
      setCepLoading(true);
      try {
        const res = await axios.get(`https://viacep.com.br/ws/${digits}/json/`);
        if (!res.data.erro) {
          setForm(f => ({
            ...f,
            customerCEP:          formatted,
            customerStreet:       res.data.logradouro || f.customerStreet,
            customerNeighborhood: res.data.bairro     || f.customerNeighborhood,
            customerCity:         res.data.localidade || f.customerCity,
          }));
          setErrors(e => ({ ...e, customerCEP: undefined, customerStreet: undefined }));
        } else {
          setCepError('CEP não encontrado — preencha o endereço manualmente');
        }
      } catch {
        setCepError('Erro ao consultar CEP — preencha o endereço manualmente');
      } finally {
        setCepLoading(false);
      }
    }
  };

  const timeSlots = form.deliveryDate && form.city
    ? getTimeSlots(form.deliveryDate, form.city)
    : [];

  const validate = (): boolean => {
    const e: Partial<Record<keyof FormData, string>> = {};
    if (!form.customerName.trim())      e.customerName      = 'Obrigatório';
    if (!form.customerPhone.trim())     e.customerPhone     = 'Obrigatório';
    if (!form.customerCPF.trim())       e.customerCPF       = 'Obrigatório';
    const bdErr = validateBirthDate(form.customerBirthDate);
    if (bdErr)                          e.customerBirthDate = bdErr;
    if (!form.customerStreet.trim())    e.customerStreet    = 'Obrigatório';
    if (!form.product.trim())           e.product           = 'Obrigatório';
    if (!form.paymentType)              e.paymentType       = 'Selecione a forma de pagamento';
    if (form.paymentType === 'crediario') {
      if (!form.installments)           e.installments      = 'Informe o número de parcelas';
      if (!form.installmentValue)       e.installmentValue  = 'Informe o valor da parcela';
    }
    if (!form.city)                     e.city              = 'Selecione a cidade';
    if (!form.deliveryDate)             e.deliveryDate      = 'Selecione a data';
    else if (form.deliveryDate <= todaySPStr()) e.deliveryDate = 'Data de entrega deve ser a partir de amanhã';
    if (!form.deliveryTime)             e.deliveryTime      = 'Selecione o horário';
    else if (form.deliveryDate && form.city &&
             !getTimeSlots(form.deliveryDate, form.city).includes(form.deliveryTime))
                                        e.deliveryTime      = 'Horário inválido para este dia';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // Monta endereço completo a partir dos sub-campos
  const fullAddress = () => {
    const parts = [
      form.customerStreet,
      form.customerNumber,
      form.customerComplement,
      form.customerNeighborhood,
      form.customerCity,
    ].filter(Boolean);
    const addr = parts.join(', ');
    return form.customerCEP ? `${addr} — CEP ${form.customerCEP}` : addr;
  };

  const buildMessage = useCallback((): string => {
    if (!seller) return '';
    const payLabel = PAYMENT_LABELS[form.paymentType] || form.paymentType;
    const fmtDate = (iso: string) => { const [y,m,d] = iso.split('-'); return `${d}/${m}/${y}`; };
    const payExtra = form.paymentType === 'crediario'
      ? [
          `\n💳 Parcelamento: ${form.installments}x de R$ ${form.installmentValue}`,
          form.downPaymentDate ? `\nData da Entrada: ${fmtDate(form.downPaymentDate)}` : null,
          form.firstDueDate    ? `\n1º Vencimento: ${fmtDate(form.firstDueDate)}`    : null,
        ].filter(Boolean).join('')
      : '';
    return [
      `📦 *PEDIDO - Amor Infinito Enxovais*`,
      ``,
      `👤 *Vendedor:* ${seller.name}`,
      ``,
      `─────────────────────`,
      `👤 *DADOS DO CLIENTE*`,
      `Nome: ${form.customerName}`,
      `Telefone: ${form.customerPhone}`,
      `CPF: ${form.customerCPF}`,
      `Nascimento: ${fmtBirthForMsg(form.customerBirthDate)}`,
      `Endereço: ${fullAddress()}`,
      form.customerWorkplace ? `Onde trabalha: ${form.customerWorkplace}` : null,
      ``,
      `─────────────────────`,
      `🛍️ *PRODUTO*`,
      selectedProduct
        ? `${form.product}${selectedProduct.description ? ` (${selectedProduct.description})` : ''} — ${fmtPrice(selectedProduct.price)}`
        : form.product,
      ``,
      `─────────────────────`,
      `💳 *PAGAMENTO*`,
      `Forma: ${payLabel}${payExtra}`,
      ``,
      `─────────────────────`,
      `🚚 *ENTREGA*`,
      `Cidade: ${form.city}`,
      `Data: ${fmtDisplayDateLong(form.deliveryDate)}`,
      `Horário: ${form.deliveryTime}`,
      ``,
      `─────────────────────`,
      `📅 Pedido gerado em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
    ].filter(l => l !== null).join('\n');
  }, [seller, form, selectedProduct]);

  const handleSendWhatsApp = async () => {
    if (!validate()) return;
    setReserving(true);
    setReserveError('');
    try {
      await API.post('/order-form/reserve', {
        code:         seller!.code,
        date:         form.deliveryDate,
        time:         form.deliveryTime,
        customerName: form.customerName,
        city:         form.city,
      });
      const msg = buildMessage();
      setWaUrl(`https://wa.me/?text=${encodeURIComponent(msg)}`);
    } catch (e: any) {
      const status = e.response?.status;
      setReserveError(e.response?.data?.error ?? 'Erro ao reservar horário. Tente novamente.');
      if (status === 409 && seller && form.deliveryDate) {
        API.get<string[]>(`/order-form/booked-slots?date=${form.deliveryDate}&code=${encodeURIComponent(seller.code)}`)
          .then(r => setBookedSlots(new Set(r.data)))
          .catch(() => {});
        set('deliveryTime', '');
      }
    } finally {
      setReserving(false);
    }
  };

  const handleSendPhoto = async () => {
    if (!photoInputRef.current) return;
    const canShare = typeof navigator.share === 'function' && typeof navigator.canShare === 'function';
    if (canShare) {
      photoInputRef.current.onchange = async (ev: Event) => {
        const file = (ev.target as HTMLInputElement).files?.[0];
        if (!file) return;
        try {
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: `Foto — ${form.customerName || 'cliente'}` });
            return;
          }
        } catch { /* user cancelled */ }
        setPhotoInstructions(true);
      };
      photoInputRef.current.click();
    } else {
      setPhotoInstructions(true);
    }
  };

  const isDeliveryDateBlocked = (d: string) => !d ? false : getDOW(d) === 0 || holidays.has(d);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      {/* Header */}
      <div className="bg-primary text-white px-4 py-5 shadow">
        <h1 className="text-xl font-bold text-center">Amor Infinito Enxovais</h1>
        <p className="text-sm text-center opacity-90 mt-0.5">Formulário de Pedido Externo</p>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-6 space-y-5">

        {/* ── Código do vendedor ────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <h2 className="font-semibold text-gray-900 mb-3">Código do Vendedor</h2>
          {seller ? (
            <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-xl">
              <span className="text-2xl">✅</span>
              <div>
                <p className="font-semibold text-green-800">{seller.name}</p>
                <p className="text-xs text-green-600">Código validado</p>
              </div>
              <button
                onClick={() => { setSeller(null); setCode(''); setForm(EMPTY_FORM); setWaUrl(''); setWaSent(false); setSelectedProduct(null); setProductSearch(''); setDebouncedSearch(''); setAllProducts([]); setShowProductList(false); setBookedSlots(new Set()); setReserveError(''); }}
                className="ml-auto text-xs text-gray-400 hover:text-gray-600 underline"
              >
                Trocar
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <input
                type="text"
                value={code}
                onChange={e => { setCode(e.target.value.toUpperCase()); setCodeError(''); }}
                onKeyDown={e => e.key === 'Enter' && validateCode()}
                placeholder="Digite seu código (ex: MARIA01)"
                className="input-base w-full text-center font-mono text-lg tracking-widest uppercase"
                autoCapitalize="characters"
              />
              {codeError && <p className="text-sm text-red-500 text-center">{codeError}</p>}
              <button
                onClick={validateCode}
                disabled={codeLoading || !code.trim()}
                className="w-full py-3 rounded-xl bg-primary text-white font-semibold text-base disabled:opacity-50 transition-opacity"
              >
                {codeLoading ? '⏳ Validando...' : 'Entrar'}
              </button>
            </div>
          )}
        </div>

        {/* ── Form (só aparece após código válido) ─────────── */}
        {seller && (
          <>
            {/* Dados do cliente */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
              <h2 className="font-semibold text-gray-900">👤 Dados do Cliente</h2>

              <Field label="Nome completo" error={errors.customerName}>
                <input className="input-base w-full" value={form.customerName}
                  onChange={e => set('customerName', e.target.value)} placeholder="Nome do cliente" />
              </Field>

              <Field label="Telefone" error={errors.customerPhone}>
                <input className="input-base w-full" value={form.customerPhone}
                  onChange={e => set('customerPhone', maskPhone(e.target.value))}
                  placeholder="(00) 00000-0000" inputMode="tel" />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="CPF" error={errors.customerCPF}>
                  <input className="input-base w-full" value={form.customerCPF}
                    onChange={e => set('customerCPF', maskCPF(e.target.value))}
                    placeholder="000.000.000-00" inputMode="numeric" />
                </Field>

                <Field label="Data de Nascimento" error={errors.customerBirthDate}>
                  <input
                    className="input-base w-full"
                    value={form.customerBirthDate}
                    onChange={e => set('customerBirthDate', maskBirthDate(e.target.value))}
                    placeholder="dd/MM/aaaa"
                    inputMode="numeric"
                    maxLength={10}
                  />
                </Field>
              </div>

              {/* CEP + auto-fill */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  CEP <span className="text-gray-400 font-normal text-xs">(preenchimento automático)</span>
                </label>
                <div className="relative">
                  <input
                    className="input-base w-full pr-8"
                    value={form.customerCEP}
                    onChange={e => handleCepChange(e.target.value)}
                    placeholder="00000-000"
                    inputMode="numeric"
                    maxLength={9}
                  />
                  {cepLoading && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                </div>
                {cepError && <p className="text-xs text-amber-600 mt-1">⚠️ {cepError}</p>}
              </div>

              <Field label="Logradouro (rua/av.)" error={errors.customerStreet}>
                <input className="input-base w-full" value={form.customerStreet}
                  onChange={e => set('customerStreet', e.target.value)} placeholder="Rua / Avenida" />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Número" required={false}>
                  <input className="input-base w-full" value={form.customerNumber}
                    onChange={e => set('customerNumber', e.target.value)} placeholder="Ex: 123" inputMode="numeric" />
                </Field>
                <Field label="Complemento" required={false}>
                  <input className="input-base w-full" value={form.customerComplement}
                    onChange={e => set('customerComplement', e.target.value)} placeholder="Apto, bloco..." />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Bairro" required={false}>
                  <input className="input-base w-full" value={form.customerNeighborhood}
                    onChange={e => set('customerNeighborhood', e.target.value)} placeholder="Bairro" />
                </Field>
                <Field label="Cidade" required={false}>
                  <input className="input-base w-full" value={form.customerCity}
                    onChange={e => set('customerCity', e.target.value)} placeholder="Cidade" />
                </Field>
              </div>

              <Field label="Onde trabalha" required={false}>
                <input className="input-base w-full" value={form.customerWorkplace}
                  onChange={e => set('customerWorkplace', e.target.value)} placeholder="Empresa / cargo (opcional)" />
              </Field>
            </div>

            {/* Produto */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3">
              <h2 className="font-semibold text-gray-900">🛍️ Produto</h2>
              {productLoading ? (
                <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
                  <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  Carregando produtos...
                </div>
              ) : selectedProduct ? (
                <div>
                  <div className="flex items-center justify-between p-3 bg-primary/5 border border-primary/20 rounded-xl">
                    <div>
                      <p className="font-medium text-gray-900 text-sm">{selectedProduct.name}</p>
                      {selectedProduct.description && <p className="text-xs text-gray-500 mt-0.5">{selectedProduct.description}</p>}
                      <p className="text-xs text-primary font-semibold mt-0.5">{fmtPrice(selectedProduct.price)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setSelectedProduct(null); set('product', ''); setProductSearch(''); setDebouncedSearch(''); setShowProductList(false); }}
                      className="text-xs text-gray-400 hover:text-red-500 transition-colors ml-3 underline"
                    >
                      Trocar
                    </button>
                  </div>
                  {errors.product && <p className="text-xs text-red-500 mt-1">{errors.product}</p>}
                </div>
              ) : (
                <div className="relative">
                  <Field label="Buscar produto" error={errors.product}>
                    <input
                      className="input-base w-full"
                      value={productSearch}
                      onChange={e => handleProductSearch(e.target.value)}
                      onFocus={() => setShowProductList(true)}
                      onBlur={() => setTimeout(() => setShowProductList(false), 150)}
                      placeholder="Digite o nome do produto..."
                      autoComplete="off"
                    />
                  </Field>
                  {showProductList && (
                    <div className="mt-1 border border-gray-200 rounded-xl overflow-hidden shadow-md max-h-60 overflow-y-auto z-10 relative bg-white">
                      {filteredProducts.length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-4">
                          {debouncedSearch ? 'Nenhum produto encontrado' : 'Nenhum produto disponível'}
                        </p>
                      ) : (
                        filteredProducts.map((p, i) => (
                          <button
                            key={i}
                            type="button"
                            className="w-full text-left px-4 py-3 hover:bg-primary/5 transition-colors border-b border-gray-100 last:border-0"
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => { setSelectedProduct(p); set('product', p.name); setShowProductList(false); }}
                          >
                            <p className="text-sm font-medium text-gray-900">{p.name}</p>
                            {p.description && <p className="text-xs text-gray-500">{p.description}</p>}
                            <p className="text-xs text-primary font-semibold mt-0.5">{fmtPrice(p.price)}</p>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Pagamento */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
              <h2 className="font-semibold text-gray-900">💳 Pagamento</h2>

              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Forma de pagamento</p>
                <div className="grid grid-cols-3 gap-2">
                  {(['avista', 'cartao', 'crediario'] as const).map(pt => (
                    <button key={pt}
                      onClick={() => { set('paymentType', pt); if (pt !== 'crediario') { set('installments', ''); set('installmentValue', ''); } }}
                      className={`py-3 rounded-xl border-2 text-sm font-medium transition-colors ${
                        form.paymentType === pt ? 'border-primary bg-primary text-white' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      {PAYMENT_LABELS[pt]}
                    </button>
                  ))}
                </div>
                {errors.paymentType && <p className="text-xs text-red-500 mt-1">{errors.paymentType}</p>}
              </div>

              {form.paymentType === 'crediario' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Nº de parcelas" error={errors.installments}>
                      <input className="input-base w-full" value={form.installments}
                        onChange={e => set('installments', e.target.value.replace(/\D/g, ''))}
                        placeholder="Ex: 12" inputMode="numeric" />
                    </Field>
                    <Field label="Valor da parcela" error={errors.installmentValue}>
                      <input className="input-base w-full" value={form.installmentValue}
                        onChange={e => set('installmentValue', e.target.value)}
                        placeholder="Ex: 120,00" inputMode="decimal" />
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Data da Entrada" required={false}>
                      <input type="date" className="input-base w-full" value={form.downPaymentDate}
                        onChange={e => set('downPaymentDate', e.target.value)} />
                    </Field>
                    <Field label="1º Vencimento" required={false}>
                      <input type="date" className="input-base w-full" value={form.firstDueDate}
                        onChange={e => set('firstDueDate', e.target.value)} />
                    </Field>
                  </div>
                </div>
              )}
            </div>

            {/* Entrega */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
              <h2 className="font-semibold text-gray-900">🚚 Entrega</h2>

              <Field label="Cidade de entrega" error={errors.city}>
                <select className="input-base w-full" value={form.city} onChange={e => set('city', e.target.value)}>
                  <option value="">Selecione a cidade</option>
                  {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>

              {form.city && (
                <>
                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-2">Data de entrega</p>
                    <div className="border border-gray-200 rounded-xl p-3">
                      <MiniCalendar selected={form.deliveryDate} onSelect={d => set('deliveryDate', d)} blockedDates={holidays} />
                    </div>
                    {form.deliveryDate && isDeliveryDateBlocked(form.deliveryDate) && (
                      <p className="text-xs text-red-500 mt-1">Esta data é domingo ou feriado — selecione outro dia</p>
                    )}
                    {errors.deliveryDate && <p className="text-xs text-red-500 mt-1">{errors.deliveryDate}</p>}
                    {form.deliveryDate && holidays.has(form.deliveryDate) && (
                      <p className="text-xs text-amber-600 mt-1">⚠️ Feriado: {holidayDesc[form.deliveryDate]}</p>
                    )}
                    {form.deliveryDate && !isDeliveryDateBlocked(form.deliveryDate) && (
                      <p className="text-xs text-gray-500 mt-1">
                        {fmtDisplayDateLong(form.deliveryDate)} — {
                          form.city === 'Jaboticabal'
                            ? (getDOW(form.deliveryDate) >= 1 && getDOW(form.deliveryDate) <= 4 ? 'Jaboticabal: 09:00–17:00'
                              : getDOW(form.deliveryDate) === 5 ? 'Sexta: 09:00–18:00' : 'Sábado: 09:00–12:00')
                            : (getDOW(form.deliveryDate) >= 1 && getDOW(form.deliveryDate) <= 4 ? 'Região: 09:00–16:00'
                              : getDOW(form.deliveryDate) === 5 ? 'Sexta: 09:00–18:00' : 'Sábado: 09:00–12:00')
                        }
                      </p>
                    )}
                  </div>

                  {form.deliveryDate && !isDeliveryDateBlocked(form.deliveryDate) && timeSlots.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <p className="text-sm font-medium text-gray-700">Horário de entrega</p>
                        {slotsLoading && <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {timeSlots.map(t => {
                          const booked = bookedSlots.has(t);
                          return (
                            <button key={t}
                              onClick={() => !booked && set('deliveryTime', t)}
                              disabled={booked}
                              title={booked ? 'Horário já reservado' : undefined}
                              className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                                booked
                                  ? 'border-gray-100 text-gray-300 bg-gray-50 cursor-not-allowed line-through'
                                  : form.deliveryTime === t
                                    ? 'bg-primary border-primary text-white'
                                    : 'border-gray-200 text-gray-700 hover:border-primary hover:text-primary'
                              }`}
                            >
                              {t}
                            </button>
                          );
                        })}
                      </div>
                      {errors.deliveryTime && <p className="text-xs text-red-500 mt-1">{errors.deliveryTime}</p>}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Ações */}
            {waUrl === '' ? (
              /* ── Passo 1: botão de envio ── */
              <div className="space-y-3">
                {reserveError && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
                    {reserveError}
                  </div>
                )}
                <button
                  onClick={handleSendWhatsApp}
                  disabled={reserving}
                  className="w-full py-4 rounded-2xl bg-green-500 hover:bg-green-600 text-white font-bold text-lg shadow-lg transition-colors flex items-center justify-center gap-3 disabled:opacity-60"
                >
                  {reserving
                    ? <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Reservando horário...</>
                    : <><span className="text-2xl">📤</span> Enviar pedido pelo WhatsApp</>
                  }
                </button>
                <p className="text-xs text-gray-400 text-center">
                  Reserva o horário e abre o WhatsApp com o texto pronto.
                </p>
              </div>
            ) : !waSent ? (
              /* ── Passo 2: horário reservado — vendedor deve abrir o WA ── */
              <div className="space-y-3">
                <div className="bg-green-50 border border-green-200 rounded-2xl p-4 text-center">
                  <p className="text-3xl mb-1">✅</p>
                  <p className="font-semibold text-green-800">Horário reservado!</p>
                  <p className="text-sm text-green-700 mt-1">
                    Toque no botão abaixo para abrir o WhatsApp e enviar o pedido no grupo.
                  </p>
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800 flex gap-2">
                  <span className="flex-shrink-0">⚠️</span>
                  <span>O pedido <strong>só chega no grupo</strong> quando você abrir o WhatsApp e enviar a mensagem.</span>
                </div>

                <a
                  href={waUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setWaSent(true)}
                  className="w-full py-4 rounded-2xl bg-green-500 hover:bg-green-600 text-white font-bold text-lg shadow-lg transition-colors flex items-center justify-center gap-3"
                >
                  <span className="text-2xl">📱</span> Abrir WhatsApp e enviar pedido
                </a>

                <p className="text-xs text-gray-400 text-center">
                  Escolha o grupo de pedidos e envie a mensagem.
                </p>
              </div>
            ) : (
              /* ── Passo 3: pedido enviado — foto do cliente ── */
              <div className="space-y-3">
                <div className="bg-green-50 border border-green-200 rounded-2xl p-4 text-center">
                  <p className="text-3xl mb-1">🎉</p>
                  <p className="font-semibold text-green-800">Pedido enviado no WhatsApp!</p>
                  <p className="text-sm text-green-600 mt-1">Agora envie a foto do cliente no mesmo grupo.</p>
                </div>

                <button
                  onClick={handleSendPhoto}
                  className="w-full py-4 rounded-2xl bg-blue-500 hover:bg-blue-600 text-white font-bold text-lg shadow-lg transition-colors flex items-center justify-center gap-3"
                >
                  <span className="text-2xl">📷</span> Enviar foto do cliente
                </button>

                {photoInstructions && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
                    <p className="font-semibold mb-1">Como enviar a foto:</p>
                    <ol className="list-decimal list-inside space-y-1">
                      <li>Abra o grupo de WhatsApp onde enviou o pedido</li>
                      <li>Toque no ícone de <strong>anexo (📎)</strong></li>
                      <li>Selecione ou tire a foto do cliente</li>
                      <li>Envie no grupo</li>
                    </ol>
                  </div>
                )}

                <button
                  onClick={() => { setForm(EMPTY_FORM); setWaUrl(''); setWaSent(false); setPhotoInstructions(false); setCepError(''); setSelectedProduct(null); setProductSearch(''); setDebouncedSearch(''); setShowProductList(false); setBookedSlots(new Set()); setReserveError(''); }}
                  className="w-full py-3 rounded-xl border-2 border-gray-200 text-gray-600 font-semibold text-sm hover:border-gray-300 transition-colors"
                >
                  Novo pedido
                </button>
              </div>
            )}

            <input ref={photoInputRef} type="file" accept="image/*" className="hidden" />
          </>
        )}
      </div>
    </div>
  );
};

// ─── Field wrapper ────────────────────────────────────────────────────────────
const Field: React.FC<{ label: string; error?: string; required?: boolean; children: React.ReactNode }> = ({
  label, error, required = true, children,
}) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-1">
      {label}{required && <span className="text-red-400 ml-0.5">*</span>}
    </label>
    {children}
    {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
  </div>
);

export default OrderForm;
