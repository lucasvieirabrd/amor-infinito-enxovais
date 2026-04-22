/**
 * Normalizes a phone number to the international format with Brazil DDI (55).
 * - 11 digits (DDD + number): prepends '55'
 * - 13 digits starting with '55': already normalized, returned as-is
 * - Anything else: returned as digits only (handles SISTEMA and special values)
 */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11) return '55' + digits;
  if (digits.length === 13 && digits.startsWith('55')) return digits;
  return digits;
}
