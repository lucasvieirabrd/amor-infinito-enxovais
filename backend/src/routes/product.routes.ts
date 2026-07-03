import { Router } from 'express';
import { ProductController } from '../controllers/product.controller';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { ensureAuthorized } from '../middlewares/ensureAuthorized';

const productRouter = Router();
const productController = new ProductController();

// Todas as rotas de produtos requerem autenticação
productRouter.use(ensureAuthenticated);

productRouter.get('/categories', productController.categories);
productRouter.get('/', productController.list);
productRouter.get('/:id', productController.getById);

// Rotas protegidas para Admin ou Seller conforme necessidade
// Vendedor pode ver estoque, mas apenas Admin pode editar ou deletar produtos
productRouter.post('/', ensureAuthorized(['admin']), productController.register);
productRouter.put('/:id', ensureAuthorized(['admin']), productController.update);
productRouter.delete('/:id', ensureAuthorized(['admin']), productController.delete);

// Endpoint de sincronização manual apenas para Admin
productRouter.post('/sync', ensureAuthorized(['admin']), productController.sync);

export { productRouter };
