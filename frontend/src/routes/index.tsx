import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Login } from '../pages/Login';
import { Dashboard } from '../pages/Dashboard';
import { Customers } from '../pages/Customers';
import { Products } from '../pages/Products';
import { Sales } from '../pages/Sales';
import { Installments } from '../pages/Installments';
import { Messages } from '../pages/Messages';
import { Layout } from '../components/Layout';

const PrivateRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
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
        <Route index element={<Dashboard />} />
        <Route path="/clientes" element={<Customers />} />
        <Route path="/produtos" element={<Products />} />
        <Route path="/vendas" element={<Sales />} />
        <Route path="/crediario" element={<Installments />} />
        <Route path="/mensagens" element={<Messages />} />
        {/* Outras rotas serão adicionadas aqui */}
        <Route path="*" element={<Navigate to="/" />} />
      </Route>
    </Routes>
  );
};
