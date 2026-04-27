import { Request, Response } from 'express';
import { generateCarnePdf } from '../services/carne.service';

export class CarneController {
  async getCarne(req: Request, res: Response) {
    const { saleId } = req.params;

    try {
      const pdf = await generateCarnePdf(saleId);

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="carne-${saleId}.pdf"`,
        'Content-Length': pdf.length.toString(),
      });

      res.end(pdf);
    } catch (err: any) {
      console.error('[CarneController] Erro ao gerar carnê:', {
        saleId,
        message: err?.message,
        stack: err?.stack,
      });
      res.status(500).json({ error: 'Erro ao gerar carnê', detail: err?.message });
    }
  }
}
