import { Request, Response } from 'express';
import { BillingService } from '../services/billing.service';

const billingService = new BillingService();

export class BillingController {
  async sendCharges(req: Request, res: Response) {
    const stats = await billingService.processAllBilling();
    return res.json(stats);
  }

  async getChargesPreview(req: Request, res: Response) {
    const preview = await billingService.getChargesPreview();
    return res.json(preview);
  }

  async getBillingMessages(req: Request, res: Response) {
    const period = (req.query.period as string) || 'today';
    const messages = await billingService.getBillingMessages(period);
    return res.json(messages);
  }
}
