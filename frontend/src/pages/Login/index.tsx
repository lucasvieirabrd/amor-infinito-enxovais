import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { FiMail, FiLock, FiAlertCircle } from 'react-icons/fi';
import { Button, Input, Card } from '../../components/ui';

export const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { signIn } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await signIn({ email, password });
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erro ao realizar login. Verifique suas credenciais.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      {/* Logo Section */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-primary rounded-full mb-4">
          <span className="text-2xl font-bold text-white">AI</span>
        </div>
        <h1 className="text-4xl font-bold text-primary">Amor Infinito</h1>
        <p className="mt-2 text-gray-600">Sistema de Vendas e Crediário</p>
      </div>

      {/* Login Card */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <Card className="shadow-lg">
          <form className="space-y-6" onSubmit={handleSubmit}>
            {/* Error Message */}
            {error && (
              <div className="bg-error bg-opacity-10 border-l-4 border-error p-4 flex items-start gap-3 rounded-lg">
                <FiAlertCircle className="text-error mt-1 flex-shrink-0" size={20} />
                <span className="text-sm text-error">{error}</span>
              </div>
            )}

            {/* Email Input */}
            <Input
              label="E-mail"
              type="email"
              placeholder="exemplo@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
            />

            {/* Password Input */}
            <Input
              label="Senha"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
            />

            {/* Submit Button */}
            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={loading}
              className="w-full"
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </Button>
            <div className="text-sm text-right mt-2">
              <a href="/forgot-password" className="font-medium text-primary hover:text-primary-dark">
                Esqueceu sua senha?
              </a>
            </div>
          </form>

          {/* Footer */}
          <div className="mt-6 pt-6 border-t border-gray-100 text-center">
            <p className="text-sm text-gray-600">
              © 2026 Amor Infinito. Todos os direitos reservados.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
};
