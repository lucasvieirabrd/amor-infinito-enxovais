import { useSearchParams } from 'react-router-dom';
import { FiCreditCard, FiPhone, FiAlertTriangle } from 'react-icons/fi';
import { useAuth } from '../../hooks/useAuth';
import { Installments } from '../Installments';
import { Billing } from '../Billing';
import { DelinquencyScore } from '../DelinquencyScore';

type Tab = 'parcelas' | 'cobranca' | 'inadimplencia';

const TABS: Array<{ id: Tab; label: string; icon: React.ComponentType<{ size?: number }>; adminOnly?: boolean }> = [
  { id: 'parcelas',       label: 'Parcelas',       icon: FiCreditCard },
  { id: 'cobranca',       label: 'Cobrança',        icon: FiPhone },
  { id: 'inadimplencia',  label: 'Inadimplência',   icon: FiAlertTriangle, adminOnly: true },
];

export const Crediario: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const raw = searchParams.get('tab') as Tab | null;
  const activeTab: Tab =
    raw === 'cobranca' || raw === 'inadimplencia' ? raw : 'parcelas';

  const setTab = (tab: Tab) => {
    setSearchParams(tab === 'parcelas' ? {} : { tab }, { replace: true });
  };

  const visibleTabs = TABS.filter(t => !t.adminOnly || isAdmin);

  return (
    <div>
      {/* Tab strip */}
      <div className="flex border-b border-gray-200 bg-white px-6 pt-4">
        {visibleTabs.map(t => {
          const Icon = t.icon;
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px mr-1 ${
                active
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon size={15} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Content — each component brings its own padding and layout */}
      {activeTab === 'parcelas'      && <Installments />}
      {activeTab === 'cobranca'      && <Billing />}
      {activeTab === 'inadimplencia' && <DelinquencyScore />}
    </div>
  );
};
