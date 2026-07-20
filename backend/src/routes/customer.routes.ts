import { Router } from 'express';
import { CustomerController } from '../controllers/customer.controller';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { ensureAuthorized } from '../middlewares/ensureAuthorized';
import multer from 'multer';

const upload = multer({ storage: multer.memoryStorage() });

const photoUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Apenas JPEG, PNG e WebP são aceitos'));
    }
  },
});

const customerRouter = Router();
const customerController = new CustomerController();

// Todas as rotas de clientes requerem autenticação
customerRouter.use(ensureAuthenticated);

customerRouter.post('/', customerController.register);
customerRouter.get('/', customerController.list);

// Merge routes — must come before /:id to avoid param conflicts
customerRouter.get('/merge-preview/:primaryId/:duplicateId', ensureAuthorized(['admin']), customerController.getMergePreview);
customerRouter.post('/merge', ensureAuthorized(['admin']), customerController.merge);

// Photo routes — must come before /:id to avoid param conflicts
customerRouter.post('/:id/photo', photoUpload.single('photo'), customerController.uploadPhoto);
customerRouter.get('/:id/photo', customerController.getPhoto);
customerRouter.delete('/:id/photo', ensureAuthorized(['admin']), customerController.deletePhoto);

customerRouter.get('/:id', customerController.getById);
customerRouter.put('/:id', customerController.update);

// Apenas admin pode realizar o soft delete de um cliente
customerRouter.delete('/:id', ensureAuthorized(['admin']), customerController.delete);

// Apenas admin pode importar clientes via CSV
customerRouter.post('/import-csv', ensureAuthorized(['admin']), upload.single('file'), customerController.importCSV);

export { customerRouter };
