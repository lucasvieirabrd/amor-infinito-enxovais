import { Request, Response } from 'express';
import { generateOrdemPdf } from '../services/ordem.service';

export class OrdemController {
  async getOrdem(req: Request, res: Response) {
    const { saleId } = req.params;

    try {
      const pdf = await generateOrdemPdf(saleId);

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="ordem-${saleId}.pdf"`,
        'Content-Length': pdf.length.toString(),
      });

      res.end(pdf);
    } catch (err: any) {
      console.error('[OrdemController] Erro ao gerar ordem de venda:', {
        saleId,
        message: err?.message,
        stack: err?.stack,
      });
      res.status(500).json({ error: 'Erro ao gerar ordem de venda', detail: err?.message });
    }
  }
}
