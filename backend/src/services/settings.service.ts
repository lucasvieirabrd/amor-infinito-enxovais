import { v4 as uuidv4 } from 'uuid';
import { eq } from 'drizzle-orm';
import { db } from '../database';
import { settings } from '../database/schema';

export interface SystemContact {
  id: string;
  label: string;
  phone: string;
  roles: ContactRole[];
}

export type ContactRole =
  | 'daily_pdf'
  | 'daily_summary'
  | 'payables_alert'
  | 'delivery_assembly';

const SYSTEM_CONTACTS_KEY = 'system_contacts';

async function _loadSystemContacts(): Promise<SystemContact[]> {
  const rows = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, SYSTEM_CONTACTS_KEY))
    .limit(1);
  if (!rows[0]) return [];
  try {
    return JSON.parse(rows[0].value) as SystemContact[];
  } catch {
    return [];
  }
}

/**
 * Retorna os números de telefone (somente dígitos, sem "+") configurados
 * para um determinado papel. O WhatsAppService já normaliza o formato internamente.
 */
export async function getContactsByRole(role: ContactRole): Promise<string[]> {
  const contacts = await _loadSystemContacts();
  return contacts.filter(c => c.roles.includes(role)).map(c => c.phone);
}

export class SettingsService {
  async getAll(): Promise<Record<string, string>> {
    const rows = await db.select({ key: settings.key, value: settings.value }).from(settings);
    return rows.reduce((acc, row) => {
      acc[row.key] = row.value;
      return acc;
    }, {} as Record<string, string>);
  }

  async upsertMany(pairs: Record<string, string>): Promise<void> {
    for (const [key, value] of Object.entries(pairs)) {
      const existing = await db
        .select({ id: settings.id })
        .from(settings)
        .where(eq(settings.key, key))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(settings)
          .set({ value, updatedAt: new Date() })
          .where(eq(settings.key, key));
      } else {
        await db.insert(settings).values({ id: uuidv4(), key, value, description: '' });
      }
    }
  }

  async getSystemContacts(): Promise<SystemContact[]> {
    return _loadSystemContacts();
  }

  /**
   * Salva a lista de contatos preservando os IDs existentes.
   * Contatos sem id ou com id desconhecido recebem um UUID novo.
   */
  async upsertSystemContacts(incoming: SystemContact[]): Promise<void> {
    const existing = await _loadSystemContacts();
    const existingIds = new Set(existing.map(c => c.id));

    const merged = incoming.map(c => ({
      ...c,
      id: c.id && existingIds.has(c.id) ? c.id : uuidv4(),
    }));

    const value = JSON.stringify(merged);

    const existingRow = await db
      .select({ id: settings.id })
      .from(settings)
      .where(eq(settings.key, SYSTEM_CONTACTS_KEY))
      .limit(1);

    if (existingRow.length > 0) {
      await db
        .update(settings)
        .set({ value, updatedAt: new Date() })
        .where(eq(settings.key, SYSTEM_CONTACTS_KEY));
    } else {
      await db.insert(settings).values({
        id: uuidv4(),
        key: SYSTEM_CONTACTS_KEY,
        value,
        description: 'Contatos que recebem notificações automáticas do sistema',
      });
    }
  }
}
