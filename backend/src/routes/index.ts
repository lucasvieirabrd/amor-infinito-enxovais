import { Router } from 'express';
import { authRouter } from './auth.routes';
import { customerRouter } from './customer.routes';
import { productRouter } from './product.routes';
import { saleRouter } from './sale.routes';
import { installmentRouter } from './installment.routes';
import { webhookRouter } from './webhook.routes';
import { messageRouter } from './message.routes';

const routes = Router();

routes.use('/auth', authRouter);
routes.use('/customers', customerRouter);
routes.use('/products', productRouter);
routes.use('/sales', saleRouter);
routes.use('/installments', installmentRouter);
routes.use('/webhook', webhookRouter);
routes.use('/messages', messageRouter);

export { routes };
