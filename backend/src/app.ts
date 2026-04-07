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
import { migrate } from 'drizzle-orm/mysql2/migrator';
import { db } from './database';
import path from 'path';

// Carregar variáveis de ambiente
dotenv.config();

// Definir timezone
process.env.TZ = 'America/Sao_Paulo';

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
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true, // Permitir cookies
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

// Função para iniciar o servidor com migrações
async function startServer() {
  try {
    // Executar migrações do Drizzle
    console.log('📦 Executando migrações do banco de dados...');
    const migrationsFolder = path.join(__dirname, '../drizzle');
    await migrate(db, { migrationsFolder });
    console.log('✅ Migrações executadas com sucesso!');
  } catch (error) {
    console.error('❌ Erro ao executar migrações:', error);
    // Continuar mesmo se as migrações falharem (tabelas podem já existir)
  }

  // Iniciar o servidor
  if (process.env.NODE_ENV !== 'test') {
    httpServer.listen(port, () => {
      console.log(`[${process.env.TZ}] Servidor HTTP e WebSocket rodando na porta ${port}`);
    });
  }
}

// Iniciar o servidor
if (process.env.NODE_ENV !== 'test') {
  startServer().catch(error => {
    console.error('❌ Erro ao iniciar servidor:', error);
    process.exit(1);
  });
}

export default app;
export { httpServer };
