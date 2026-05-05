import { Request, Response } from 'express';
import { generatePromissoriaPdf } from '../services/promissoria.service';

export class PromissoriaController {
  async getPromissoria(req: Request, res: Response) {
    const { saleId } = req.params;

    try {
      const pdf = await generatePromissoriaPdf(saleId);

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="promissoria-${saleId}.pdf"`,
        'Content-Length': pdf.length.toString(),
      });

      res.end(pdf);
    } catch (err: any) {
      console.error('[PromissoriaController] Erro ao gerar promissória:', {
        saleId,
        message: err?.message,
        stack: err?.stack,
      });
      res.status(500).json({ error: 'Erro ao gerar promissória', detail: err?.message });
    }
  }
}
