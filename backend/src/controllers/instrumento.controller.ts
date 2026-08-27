import { Request, Response } from 'express';
import { generateInstrumentoPdf } from '../services/instrumento.service';

export class InstrumentoController {
  async getInstrumento(req: Request, res: Response) {
    const { saleId } = req.params;

    try {
      const pdf = await generateInstrumentoPdf(saleId);

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="instrumento-${saleId}.pdf"`,
        'Content-Length': pdf.length.toString(),
      });

      res.end(pdf);
    } catch (err: any) {
      console.error('[InstrumentoController] Erro ao gerar instrumento:', {
        saleId,
        message: err?.message,
        stack: err?.stack,
      });
      res.status(500).json({ error: 'Erro ao gerar instrumento', detail: err?.message });
    }
  }
}
