import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useAuth } from '../hooks/useAuth';
import { Login } from '../pages/Login';
import ForgotPassword from '../pages/ForgotPassword';
import ResetPassword from '../pages/ResetPassword';
import { PrivacyPolicy } from '../pages/PrivacyPolicy';
import { Dashboard } from '../pages/Dashboard';
import { Customers } from '../pages/Customers';
import { Products } from '../pages/Products';
import { Sales } from '../pages/Sales';
import { SalesHistory } from '../pages/SalesHistory';
import { Messages } from '../pages/Messages';
import { Settings } from '../pages/Settings';
import { Deliveries } from '../pages/Deliveries';
import { Crediario } from '../pages/Crediario';
import { Payables } from '../pages/Payables';
import { Layout } from '../components/Layout';

const Spinner = () => (
  <div className="flex items-center justify-center h-screen">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
  </div>
);

const PrivateRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <Spinner />;
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" />;
};

const TAB_FALLBACK_ORDER = [
  'dashboard', 'clientes', 'produtos', 'vendas',
  'crediario', 'cobranca', 'mensagens', 'entregas', 'contas_a_pagar',
];

const TAB_PATHS: Record<string, string> = {
  dashboard: '/dashboard',
  clientes: '/customers',
  produtos: '/products',
  vendas: '/sales',
  crediario: '/crediario',
  cobranca: '/crediario?tab=cobranca',
  mensagens: '/messages',
  entregas: '/deliveries',
  contas_a_pagar: '/contas-a-pagar',
};

const TabRoute: React.FC<{ tab: string | string[]; children: React.ReactNode }> = ({ tab, children }) => {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;

  const isAdmin = user?.role === 'admin';
  const tabs = Array.isArray(tab) ? tab : [tab];

  const allowed = isAdmin || tabs.some(t => (user?.allowedTabs ?? []).includes(t));
  if (allowed) return <>{children}</>;

  const fallbackTab = TAB_FALLBACK_ORDER.find(t => isAdmin || (user?.allowedTabs ?? []).includes(t));
  const fallbackPath = fallbackTab ? TAB_PATHS[fallbackTab] : '/login';

  toast.error('Sem acesso a esta área', { toastId: 'no-tab-access' });
  return <Navigate to={fallbackPath} replace />;
};

export const AppRoutes: React.FC = () => {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/privacy-policy" element={<PrivacyPolicy />} />

      <Route
        path="/"
        element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }
      >
        <Route path="/dashboard"      element={<TabRoute tab="dashboard"><Dashboard /></TabRoute>} />
        <Route path="/customers"      element={<TabRoute tab="clientes"><Customers /></TabRoute>} />
        <Route path="/products"       element={<TabRoute tab="produtos"><Products /></TabRoute>} />
        <Route path="/sales"          element={<TabRoute tab="vendas"><Sales /></TabRoute>} />
        <Route path="/sales/history"  element={<TabRoute tab="vendas"><SalesHistory /></TabRoute>} />
        <Route path="/crediario"      element={<TabRoute tab={['crediario', 'cobranca']}><Crediario /></TabRoute>} />
        <Route path="/installments"   element={<Navigate to="/crediario" replace />} />
        <Route path="/billing"        element={<Navigate to="/crediario?tab=cobranca" replace />} />
        <Route path="/cobrança"       element={<Navigate to="/crediario?tab=cobranca" replace />} />
        <Route path="/delinquency-score" element={<Navigate to="/crediario?tab=inadimplencia" replace />} />
        <Route path="/messages"       element={<TabRoute tab="mensagens"><Messages /></TabRoute>} />
        <Route path="/settings"       element={<TabRoute tab="admin_only"><Settings /></TabRoute>} />
        <Route path="/deliveries"     element={<TabRoute tab="entregas"><Deliveries /></TabRoute>} />
        <Route path="/contas-a-pagar" element={<TabRoute tab="contas_a_pagar"><Payables /></TabRoute>} />
        <Route index element={<Navigate to="/dashboard" />} />
        <Route path="*" element={<Navigate to="/dashboard" />} />
      </Route>
    </Routes>
  );
};
