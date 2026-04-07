import { Router } from 'express';
import { SaleController } from '../controllers/sale.controller';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';

const saleRouter = Router();
const saleController = new SaleController();

// Todas as rotas de vendas requerem autenticação
saleRouter.use(ensureAuthenticated);

saleRouter.post('/', saleController.register);
saleRouter.get('/', saleController.list);
saleRouter.get('/:id', saleController.getById);

export { saleRouter };
