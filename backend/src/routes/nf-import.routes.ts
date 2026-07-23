import { Router } from 'express';
import multer from 'multer';
import { NfImportController } from '../controllers/nf-import.controller';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { ensureAuthorized } from '../middlewares/ensureAuthorized';

const nfImportRouter = Router();
const nfImportController = new NfImportController();

const pdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Apenas arquivos PDF são aceitos') as any, false);
    }
  },
});

nfImportRouter.use(ensureAuthenticated);
nfImportRouter.use(ensureAuthorized(['admin']));

nfImportRouter.post('/parse', pdfUpload.single('nf'), nfImportController.parse);
nfImportRouter.post('/confirm', nfImportController.confirm);
nfImportRouter.get('/', nfImportController.list);

export { nfImportRouter };
