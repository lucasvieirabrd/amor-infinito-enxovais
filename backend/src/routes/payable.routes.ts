import { Router } from 'express';
import multer from 'multer';
import { PayableController } from '../controllers/payable.controller';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { ensureAuthorized } from '../middlewares/ensureAuthorized';

const payableRouter = Router();
const controller = new PayableController();

const boletoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo não permitido. Envie PDF, JPEG, PNG ou WebP.'));
    }
  },
});

payableRouter.use(ensureAuthenticated);
payableRouter.use(ensureAuthorized(['admin']));

// Recurrences (before /:id to avoid param conflicts)
payableRouter.get('/recurrences', controller.listRecurrences);
payableRouter.post('/recurrences', controller.createRecurrence);
payableRouter.patch('/recurrences/:id', controller.updateRecurrence);
payableRouter.delete('/recurrences/:id', controller.removeRecurrence);

// Summary (before /:id)
payableRouter.get('/summary', controller.summary);

// Boleto (before /:id so /id/boleto doesn't accidentally match /:id)
payableRouter.post('/:id/boleto', boletoUpload.single('boleto'), controller.uploadBoleto);
payableRouter.get('/:id/boleto', controller.downloadBoleto);
payableRouter.delete('/:id/boleto', controller.removeBoleto);

// Payables CRUD
payableRouter.get('/', controller.list);
payableRouter.post('/', controller.create);
payableRouter.patch('/:id/pay', controller.pay);
payableRouter.patch('/:id/revert', controller.revert);
payableRouter.patch('/:id', controller.update);
payableRouter.delete('/:id', controller.remove);

export { payableRouter };
