import { Request, Response } from 'express';
import { SalesService } from '../services/sales.service';

export class SalesController {
  private salesService: SalesService;

  constructor() {
    this.salesService = new SalesService();
  }

  async getTotalSales(req: Request, res: Response): Promise<Response> {
    const totalSales = await this.salesService.getTotalSales();
    return res.json({ totalSales });
  }

  async getLast7DaysSales(req: Request, res: Response): Promise<Response> {
    const last7DaysSales = await this.salesService.getLast7DaysSales();
    return res.json({ last7DaysSales });
  }
}
