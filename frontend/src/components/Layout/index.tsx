import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from '../Sidebar';
import Header from '../Header';

export const Layout: React.FC = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar */}
      <Sidebar />

      {/* Main Content */}
      <div className="lg:ml-sidebar">
        {/* Header */}
        <Header />

        {/* Page Content */}
        <main className="pt-header px-6 py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
