import React, { useState, useEffect, useRef, useCallback } from 'react';
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

function fmtDisplayDate(s: string): string {
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
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
  let endH: number;
  if (dow === 6) endH = 12;
  else if (dow === 5) endH = 18;
  else endH = city === 'Jaboticabal' ? 17 : 16;

  const slots: string[] = [];
  for (let h = 9; h < endH; h++) {
    for (const m of [0, 30]) {
      slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }
  return slots;
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
  const today = todayStr();
  const initDate = selected || today;
  const [year, setYear] = useState(() => Number(initDate.split('-')[0]));
  const [month, setMonth] = useState(() => Number(initDate.split('-')[1]) - 1); // 0-based

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  };

  // Build grid
  const firstDay = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  const cellStr = (day: number) => `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  const isDisabled = (ds: string) => {
    if (ds < today) return true;
    const dow = getDOW(ds);
    if (dow === 0) return true; // domingo
    return blockedDates.has(ds);
  };

  return (
    <div className="select-none">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-600">
          ◀
        </button>
        <span className="font-semibold text-gray-900">{MONTH_NAMES[month]} {year}</span>
        <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-600">
          ▶
        </button>
      </div>

      {/* Day labels */}
      <div className="grid grid-cols-7 mb-1">
        {DOW_LABELS.map((l, i) => (
          <div key={i} className={`text-center text-xs font-medium py-1 ${i === 0 ? 'text-red-400' : 'text-gray-500'}`}>
            {l}
          </div>
        ))}
      </div>

      {/* Days */}
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((day, i) => {
          if (!day) return <div key={i} />;
          const ds = cellStr(day);
          const disabled = isDisabled(ds);
          const isSelected = ds === selected;
          const isToday = ds === today;
          return (
            <button
              key={i}
              onClick={() => !disabled && onSelect(ds)}
              disabled={disabled}
              className={`
                aspect-square flex items-center justify-center rounded-full text-sm font-medium transition-colors
                ${isSelected
                  ? 'bg-primary text-white'
                  : disabled
                    ? 'text-gray-300 cursor-not-allowed'
                    : isToday
                      ? 'border-2 border-primary text-primary hover:bg-primary hover:text-white'
                      : 'text-gray-700 hover:bg-gray-100'
                }
              `}
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

// ─── Main Component ───────────────────────────────────────────────────────────

interface Seller { id: string; name: string }
interface HolidayEntry { date: string; description: string }

interface FormData {
  // Customer
  customerName: string;
  customerPhone: string;
  customerCPF: string;
  customerAddress: string;
  customerWorkplace: string;
  // Product
  product: string;
  // Payment
  paymentType: 'avista' | 'cartao' | 'crediario' | '';
  installments: string;
  installmentValue: string;
  // Delivery
  city: string;
  deliveryDate: string;
  deliveryTime: string;
}

const EMPTY_FORM: FormData = {
  customerName: '', customerPhone: '', customerCPF: '', customerAddress: '', customerWorkplace: '',
  product: '',
  paymentType: '', installments: '', installmentValue: '',
  city: '', deliveryDate: '', deliveryTime: '',
};

export const OrderForm: React.FC = () => {
  const [code, setCode]         = useState('');
  const [seller, setSeller]     = useState<Seller | null>(null);
  const [codeError, setCodeError] = useState('');
  const [codeLoading, setCodeLoading] = useState(false);

  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});

  const [holidays, setHolidays] = useState<Set<string>>(new Set());
  const [holidayDesc, setHolidayDesc] = useState<Record<string, string>>({});

  const [submitted, setSubmitted] = useState(false);
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

  // Reset time when date/city changes
  useEffect(() => {
    setForm(f => ({ ...f, deliveryTime: '' }));
  }, [form.deliveryDate, form.city]);

  const validateCode = async () => {
    if (!code.trim()) { setCodeError('Informe o código'); return; }
    setCodeLoading(true);
    setCodeError('');
    try {
      const res = await API.get<Seller>(`/order-form/seller?code=${encodeURIComponent(code.toUpperCase())}`);
      setSeller(res.data);
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

  const timeSlots = form.deliveryDate && form.city
    ? getTimeSlots(form.deliveryDate, form.city)
    : [];

  const isHolidayDate = (d: string) => holidays.has(d);

  const validate = (): boolean => {
    const e: typeof errors = {};
    if (!form.customerName.trim())     e.customerName    = 'Obrigatório';
    if (!form.customerPhone.trim())    e.customerPhone   = 'Obrigatório';
    if (!form.customerCPF.trim())      e.customerCPF     = 'Obrigatório';
    if (!form.customerAddress.trim())  e.customerAddress = 'Obrigatório';
    if (!form.product.trim())          e.product         = 'Obrigatório';
    if (!form.paymentType)             e.paymentType     = 'Selecione a forma de pagamento';
    if (form.paymentType === 'crediario') {
      if (!form.installments)          e.installments    = 'Informe o número de parcelas';
      if (!form.installmentValue)      e.installmentValue = 'Informe o valor da parcela';
    }
    if (!form.city)                    e.city            = 'Selecione a cidade';
    if (!form.deliveryDate)            e.deliveryDate    = 'Selecione a data';
    if (!form.deliveryTime)            e.deliveryTime    = 'Selecione o horário';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const buildMessage = useCallback((): string => {
    if (!seller) return '';
    const payLabel = PAYMENT_LABELS[form.paymentType] || form.paymentType;
    const payExtra = form.paymentType === 'crediario'
      ? `\n💳 Parcelamento: ${form.installments}x de R$ ${form.installmentValue}`
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
      `Endereço: ${form.customerAddress}`,
      form.customerWorkplace ? `Onde trabalha: ${form.customerWorkplace}` : null,
      ``,
      `─────────────────────`,
      `🛍️ *PRODUTO*`,
      form.product,
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
  }, [seller, form]);

  const handleSendWhatsApp = () => {
    if (!validate()) return;
    const msg = buildMessage();
    const url = `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
    setSubmitted(true);
  };

  const handleSendPhoto = async () => {
    if (photoInputRef.current) {
      // Try navigator.share with files (Chrome Android 100+)
      const canShareFiles = typeof navigator.share === 'function' && typeof navigator.canShare === 'function';
      if (canShareFiles) {
        photoInputRef.current.onchange = async (ev: Event) => {
          const file = (ev.target as HTMLInputElement).files?.[0];
          if (!file) return;
          try {
            if (navigator.canShare({ files: [file] })) {
              await navigator.share({ files: [file], title: `Foto — ${form.customerName || 'cliente'}` });
              return;
            }
          } catch { /* user cancelled or not supported */ }
          setPhotoInstructions(true);
        };
        photoInputRef.current.click();
      } else {
        setPhotoInstructions(true);
      }
    }
  };

  const isDeliveryDateBlocked = (d: string) => {
    if (!d) return false;
    const dow = getDOW(d);
    return dow === 0 || holidays.has(d);
  };

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
                onClick={() => { setSeller(null); setCode(''); setForm(EMPTY_FORM); setSubmitted(false); }}
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

              <Field label="CPF" error={errors.customerCPF}>
                <input className="input-base w-full" value={form.customerCPF}
                  onChange={e => set('customerCPF', maskCPF(e.target.value))}
                  placeholder="000.000.000-00" inputMode="numeric" />
              </Field>

              <Field label="Endereço" error={errors.customerAddress}>
                <input className="input-base w-full" value={form.customerAddress}
                  onChange={e => set('customerAddress', e.target.value)} placeholder="Rua, número, bairro, cidade" />
              </Field>

              <Field label="Onde trabalha" required={false}>
                <input className="input-base w-full" value={form.customerWorkplace}
                  onChange={e => set('customerWorkplace', e.target.value)} placeholder="Empresa / cargo (opcional)" />
              </Field>
            </div>

            {/* Produto */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3">
              <h2 className="font-semibold text-gray-900">🛍️ Produto</h2>
              <Field label="Descrição do produto" error={errors.product}>
                <textarea className="input-base w-full min-h-[80px] resize-none" value={form.product}
                  onChange={e => set('product', e.target.value)}
                  placeholder="Ex: Jogo de cama casal padrão bordado, cor bege" />
              </Field>
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
                        form.paymentType === pt
                          ? 'border-primary bg-primary text-white'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      {PAYMENT_LABELS[pt]}
                    </button>
                  ))}
                </div>
                {errors.paymentType && <p className="text-xs text-red-500 mt-1">{errors.paymentType}</p>}
              </div>

              {form.paymentType === 'crediario' && (
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
              )}
            </div>

            {/* Entrega */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
              <h2 className="font-semibold text-gray-900">🚚 Entrega</h2>

              <Field label="Cidade de entrega" error={errors.city}>
                <select className="input-base w-full" value={form.city}
                  onChange={e => set('city', e.target.value)}>
                  <option value="">Selecione a cidade</option>
                  {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>

              {form.city && (
                <>
                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-2">Data de entrega</p>
                    <div className="border border-gray-200 rounded-xl p-3">
                      <MiniCalendar
                        selected={form.deliveryDate}
                        onSelect={d => set('deliveryDate', d)}
                        blockedDates={holidays}
                      />
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
                              : getDOW(form.deliveryDate) === 5 ? 'Sexta: 09:00–18:00'
                              : 'Sábado: 09:00–12:00')
                            : (getDOW(form.deliveryDate) >= 1 && getDOW(form.deliveryDate) <= 4 ? 'Região: 09:00–16:00'
                              : getDOW(form.deliveryDate) === 5 ? 'Sexta: 09:00–18:00'
                              : 'Sábado: 09:00–12:00')
                        }
                      </p>
                    )}
                  </div>

                  {form.deliveryDate && !isDeliveryDateBlocked(form.deliveryDate) && timeSlots.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-gray-700 mb-2">Horário de entrega</p>
                      <div className="flex flex-wrap gap-2">
                        {timeSlots.map(t => (
                          <button key={t}
                            onClick={() => set('deliveryTime', t)}
                            className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                              form.deliveryTime === t
                                ? 'bg-primary border-primary text-white'
                                : 'border-gray-200 text-gray-700 hover:border-primary hover:text-primary'
                            }`}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                      {errors.deliveryTime && <p className="text-xs text-red-500 mt-1">{errors.deliveryTime}</p>}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Ações */}
            {!submitted ? (
              <div className="space-y-3">
                <button
                  onClick={handleSendWhatsApp}
                  className="w-full py-4 rounded-2xl bg-green-500 hover:bg-green-600 text-white font-bold text-lg shadow-lg transition-colors flex items-center justify-center gap-3"
                >
                  <span className="text-2xl">📤</span> Enviar pedido pelo WhatsApp
                </button>
                <p className="text-xs text-gray-400 text-center">
                  O WhatsApp abrirá com o texto do pedido — escolha o grupo e envie.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="bg-green-50 border border-green-200 rounded-2xl p-4 text-center">
                  <p className="text-2xl mb-1">✅</p>
                  <p className="font-semibold text-green-800">Pedido enviado!</p>
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
                  onClick={() => { setForm(EMPTY_FORM); setSubmitted(false); setPhotoInstructions(false); }}
                  className="w-full py-3 rounded-xl border-2 border-gray-200 text-gray-600 font-semibold text-sm hover:border-gray-300 transition-colors"
                >
                  Novo pedido
                </button>
              </div>
            )}

            {/* Hidden file input for photo share */}
            <input ref={photoInputRef} type="file" accept="image/*" capture="environment" className="hidden" />
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
