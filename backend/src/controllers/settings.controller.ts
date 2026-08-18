import { Request, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { SettingsService, getContactsByRole, SystemContact } from '../services/settings.service';
import { WhatsAppService } from '../integrations/whatsapp.service';
import { db } from '../database';
import { auditLogs } from '../database/schema';

const settingsService = new SettingsService();
const whatsAppService = new WhatsAppService();

const VALID_ROLES = ['daily_pdf', 'daily_summary', 'payables_alert', 'delivery_assembly'] as const;

const contactSchema = z.object({
  id: z.string().default(''),
  label: z.string().min(1, 'Label obrigatório'),
  phone: z
    .string()
    .regex(/^\d{10,15}$/, 'Telefone inválido: apenas dígitos, 10–15 caracteres'),
  roles: z.array(z.enum(VALID_ROLES)),
});

const ROLE_LABELS: Record<string, string> = {
  daily_pdf: 'PDF Diário (07h30)',
  daily_summary: 'Resumo Diário (11h)',
  payables_alert: 'Alerta Contas a Pagar',
  delivery_assembly: 'Entrega com Montagem',
};

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

  async getSystemContacts(req: Request, res: Response) {
    const contacts = await settingsService.getSystemContacts();
    return res.json(contacts);
  }

  async upsertSystemContacts(req: Request, res: Response) {
    const parsed = z.array(contactSchema).safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: parsed.error.errors[0]?.message ?? 'Dados inválidos' });
    }

    const old = await settingsService.getSystemContacts();
    await settingsService.upsertSystemContacts(parsed.data as SystemContact[]);

    await db.insert(auditLogs).values({
      id: uuidv4(),
      userId: req.user!.id,
      action: 'UPDATE_SYSTEM_CONTACTS',
      entityType: 'Settings',
      entityId: 'system_contacts',
      oldValue: old,
      newValue: parsed.data,
    });

    return res.json({ success: true });
  }

  async testContactRole(req: Request, res: Response) {
    const { role } = req.params;
    if (!VALID_ROLES.includes(role as any)) {
      return res.status(400).json({ error: 'Papel inválido' });
    }

    const phones = await getContactsByRole(role as any);
    if (phones.length === 0) {
      return res.status(400).json({
        error: `Nenhum contato configurado para "${ROLE_LABELS[role] ?? role}"`,
      });
    }

    const roleLabel = ROLE_LABELS[role] ?? role;
    const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const results: { phone: string; success: boolean; error?: string }[] = [];

    for (const phone of phones) {
      const r = await whatsAppService.sendTextMessage(
        phone,
        `[TESTE] Notificação de teste para o papel "${roleLabel}" — ${now}`,
      );
      results.push({
        phone,
        success: !r?.error,
        error: r?.error ? String(r.message ?? '') : undefined,
      });
    }

    return res.json({ results });
  }
}
