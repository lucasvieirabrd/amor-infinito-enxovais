process.env.TZ = 'America/Sao_Paulo';

import 'express-async-errors';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { rateLimit } from 'express-rate-limit';
import { routes } from './routes';
import { AppError } from './utils/AppError';
import { setupCronJobs } from './cron';
import { setupWebSocket } from './websocket';

// Definir allowedOrigins para uso no WebSocket e CORS
const allowedOrigins = [
  'https://sistema-vendas-cobranca-aie.up.railway.app',
  'http://localhost:5173'
];

// Carregar variáveis de ambiente
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const httpServer = createServer(app);

// Configurar Express para confiar em proxies (necessário para Railway)
app.set('trust proxy', 1);

// Inicializar WebSocket
setupWebSocket(httpServer);

// Middlewares básicos
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Configuração do CORS
app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
}));

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // limite de 100 requisições por IP
  message: 'Muitas requisições deste IP, por favor tente novamente após 15 minutos',
});
app.use('/api/', limiter);

// Rota raiz
app.get('/', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    message: 'Amor Infinito Enxovais API',
    version: '1.0.0',
  });
});

// Rotas da API
app.use('/api', routes);

// Endpoint de Health Check
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    timezone: process.env.TZ
  });
});

// Tratamento global de erros
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      status: 'error',
      message: err.message,
    });
  }

  console.error(err);

  return res.status(500).json({
    status: 'error',
    message: 'Erro interno do servidor',
  });
});

// Inicializar Cron Jobs
setupCronJobs();

// Iniciar o servidor
if (process.env.NODE_ENV !== 'test') {
  httpServer.listen(port, () => {
    console.log(`[${process.env.TZ}] Servidor HTTP e WebSocket rodando na porta ${port}`);
  });
}

export default app;
export { httpServer };
