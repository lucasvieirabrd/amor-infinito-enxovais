import { Router } from 'express';
import { authRouter } from './auth.routes';
import { customerRouter } from './customer.routes';
import { productRouter } from './product.routes';
import { saleRouter } from './sale.routes';
import { installmentRouter } from './installment.routes';
import { salesRoutes } from './sales.routes';
import { webhookRouter } from './webhook.routes';
import { messageRouter } from './message.routes';
import { seedRouter } from './seed.routes';
import { billingRouter } from './billing.routes';

const routes = Router();

routes.use('/auth', authRouter);
routes.use('/customers', customerRouter);
routes.use('/products', productRouter);
routes.use('/sales', saleRouter);
routes.use('/installments', installmentRouter);
routes.use('/sales', salesRoutes);
routes.use('/webhook', webhookRouter);
routes.use('/messages', messageRouter);
routes.use('/seed', seedRouter);
routes.use('/billing', billingRouter);

export { routes };
