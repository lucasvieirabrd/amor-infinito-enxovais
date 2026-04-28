import { Request, Response } from 'express';
import { SettingsService } from '../services/settings.service';

const settingsService = new SettingsService();

export class SettingsController {
  async getAll(req: Request, res: Response) {
    const data = await settingsService.getAll();
    return res.json(data);
  }

  async upsert(req: Request, res: Response) {
    const pairs = req.body as Record<string, string>;
    await settingsService.upsertMany(pairs);
    return res.json({ success: true });
  }
}
