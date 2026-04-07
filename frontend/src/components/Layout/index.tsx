import React, { useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { 
  FiHome, FiUsers, FiPackage, FiShoppingCart, 
  FiCreditCard, FiMessageSquare, FiLogOut, FiMenu, FiX 
} from 'react-icons/fi';

export const Layout: React.FC = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { user, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const menuItems = [
    { name: 'Dashboard', icon: FiHome, path: '/' },
    { name: 'Clientes', icon: FiUsers, path: '/clientes' },
    { name: 'Produtos', icon: FiPackage, path: '/produtos' },
    { name: 'Vendas', icon: FiShoppingCart, path: '/vendas' },
    { name: 'Crediário', icon: FiCreditCard, path: '/crediario' },
    { name: 'Mensagens', icon: FiMessageSquare, path: '/mensagens' },
  ];

  return (
    <div className="min-h-screen bg-gray-100 flex">
      {/* Sidebar Desktop */}
      <aside className="hidden md:flex flex-col w-64 bg-white border-r border-gray-200">
        <div className="p-6">
          <h1 className="text-2xl font-bold text-primary-600">Amor Infinito</h1>
        </div>
        <nav className="flex-1 px-4 space-y-1">
          {menuItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                location.pathname === item.path
                  ? 'bg-primary-50 text-primary-600'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <item.icon className="mr-3" size={20} />
              {item.name}
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t border-gray-200">
          <button
            onClick={handleSignOut}
            className="flex items-center w-full px-4 py-2 text-sm font-medium text-gray-600 rounded-md hover:bg-red-50 hover:text-red-600 transition-colors"
          >
            <FiLogOut className="mr-3" size={20} />
            Sair
          </button>
        </div>
      </aside>

      {/* Mobile Header & Sidebar */}
      <div className="flex-1 flex flex-col">
        <header className="bg-white border-b border-gray-200 h-16 flex items-center justify-between px-4 md:px-8">
          <button 
            className="md:hidden text-gray-600"
            onClick={() => setIsSidebarOpen(true)}
          >
            <FiMenu size={24} />
          </button>
          
          <div className="flex items-center ml-auto">
            <span className="text-sm text-gray-600 mr-4 hidden sm:block">
              Olá, <span className="font-semibold">{user?.name}</span>
            </span>
            <div className="h-8 w-8 rounded-full bg-primary-100 flex items-center justify-center text-primary-600 font-bold">
              {user?.name.charAt(0)}
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="p-4 md:p-8 overflow-auto">
          <Outlet />
        </main>
      </div>

      {/* Sidebar Mobile Overlay */}
      {isSidebarOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div className="fixed inset-0 bg-gray-600 bg-opacity-75" onClick={() => setIsSidebarOpen(false)}></div>
          <div className="relative flex-1 flex flex-col max-w-xs w-full bg-white">
            <div className="absolute top-0 right-0 -mr-12 pt-2">
              <button className="ml-1 flex items-center justify-center h-10 w-10 rounded-full focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white" onClick={() => setIsSidebarOpen(false)}>
                <FiX className="text-white" size={24} />
              </button>
            </div>
            <div className="p-6">
              <h1 className="text-2xl font-bold text-primary-600">Amor Infinito</h1>
            </div>
            <nav className="px-4 space-y-1">
              {menuItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setIsSidebarOpen(false)}
                  className={`flex items-center px-4 py-2 text-sm font-medium rounded-md ${
                    location.pathname === item.path
                      ? 'bg-primary-50 text-primary-600'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <item.icon className="mr-3" size={20} />
                  {item.name}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      )}
    </div>
  );
};
