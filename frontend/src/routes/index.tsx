import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Login } from '../pages/Login';
import { Dashboard } from '../pages/Dashboard';
import { Customers } from '../pages/Customers';
import { Products } from '../pages/Products';
import { Sales } from '../pages/Sales';
import { SalesHistory } from '../pages/SalesHistory';
import { Installments } from '../pages/Installments';
import { Messages } from '../pages/Messages';
import { Billing } from '../pages/Billing';
import { Settings } from '../pages/Settings';
import { Layout } from '../components/Layout';

const PrivateRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return isAuthenticated ? <>{children}</> : <Navigate to="/login" />;
};

export const AppRoutes: React.FC = () => {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      
      <Route
        path="/"
        element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }
      >
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/products" element={<Products />} />
        <Route path="/sales" element={<Sales />} />
        <Route path="/sales/history" element={<SalesHistory />} />
        <Route path="/installments" element={<Installments />} />
        <Route path="/messages" element={<Messages />} />
        <Route path="/billing" element={<Billing />} />
        <Route path="/cobrança" element={<Billing />} />
        <Route path="/settings" element={<Settings />} />
        <Route index element={<Navigate to="/dashboard" />} />
        <Route path="*" element={<Navigate to="/dashboard" />} />
      </Route>
    </Routes>
  );
};
