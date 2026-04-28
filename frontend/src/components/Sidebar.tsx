import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  FiHome,
  FiUsers,
  FiPackage,
  FiShoppingCart,
  FiCreditCard,
  FiPhone,
  FiMessageSquare,
  FiSettings,
  FiMenu,
  FiX,
} from 'react-icons/fi';

const Sidebar: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();

  const menuItems = [
    { path: '/dashboard', label: 'Dashboard', icon: FiHome },
    { path: '/customers', label: 'Clientes', icon: FiUsers },
    { path: '/products', label: 'Produtos', icon: FiPackage },
    { path: '/sales', label: 'Vendas', icon: FiShoppingCart },
    { path: '/installments', label: 'Crediário', icon: FiCreditCard },
    { path: '/billing', label: 'Cobrança', icon: FiPhone },
    { path: '/messages', label: 'Mensagens', icon: FiMessageSquare },
    { path: '/settings', label: 'Configurações', icon: FiSettings },
  ];

  const isActive = (path: string) => location.pathname === path;

  return (
    <>
      {/* Mobile Menu Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed top-4 left-4 z-40 lg:hidden text-gray-600 hover:text-gray-900"
      >
        {isOpen ? <FiX size={24} /> : <FiMenu size={24} />}
      </button>

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 h-screen w-sidebar bg-primary text-white transition-transform duration-300 z-30 ${
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Logo */}
        <div className="flex items-center justify-center h-header border-b border-white border-opacity-20">
          <img
            src="/logo-amor-infinito.jpeg"
            alt="Amor Infinito Enxovais"
            style={{ height: 40, width: 'auto' }}
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              const fallback = e.currentTarget.nextElementSibling as HTMLElement | null;
              if (fallback) fallback.style.display = 'block';
            }}
          />
          <h1 className="text-2xl font-bold" style={{ display: 'none' }}>Amor Infinito</h1>
        </div>

        {/* Menu Items */}
        <nav className="flex-1 overflow-y-auto py-6">
          <ul className="space-y-2 px-4">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.path);
              return (
                <li key={item.path}>
                  <Link
                    to={item.path}
                    onClick={() => setIsOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                      active
                        ? 'bg-white bg-opacity-20 text-white'
                        : 'text-white text-opacity-80 hover:text-opacity-100 hover:bg-white hover:bg-opacity-10'
                    }`}
                  >
                    <Icon size={20} />
                    <span className="font-medium">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Footer */}
        <div className="border-t border-white border-opacity-20 p-4">
          <p className="text-sm text-white text-opacity-70">© 2026 Amor Infinito</p>
        </div>
      </aside>

      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-20 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  );
};

export default Sidebar;
