import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000/api',
  withCredentials: true, // Importante para enviar/receber cookies httpOnly
});

// Interceptor para tratar erros globais
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Redirecionar para login se o token expirar (opcional, dependendo da estratégia de auth)
      // window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
