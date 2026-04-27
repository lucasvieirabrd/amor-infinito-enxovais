import { Request, Response } from 'express';
import { generateCarnePdf } from '../services/carne.service';

export class CarneController {
  async getCarne(req: Request, res: Response) {
    const { saleId } = req.params;
    const pdf = await generateCarnePdf(saleId);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="carne-${saleId}.pdf"`,
      'Content-Length': pdf.length.toString(),
    });

    res.end(pdf);
  }
}
