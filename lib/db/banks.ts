import { eq, sql } from "drizzle-orm";
import { db } from "./connection";
import { bankEmails, banks } from "./schema";
import type { Bank, BankEmail, BankWithEmails } from "./types";

export async function getAllBanksWithEmails(): Promise<BankWithEmails[]> {
  const allBanks = (await db.select().from(banks)) as Bank[];
  const allEmails = (await db.select().from(bankEmails)) as BankEmail[];
  const byBank = new Map<number, BankEmail[]>();
  for (const e of allEmails) {
    const arr = byBank.get(e.bank_id) ?? [];
    arr.push(e);
    byBank.set(e.bank_id, arr);
  }
  return allBanks.map((b) => ({ ...b, emails: byBank.get(b.id) ?? [] }));
}

export async function getActiveBanksWithEmails(): Promise<BankWithEmails[]> {
  const all = await getAllBanksWithEmails();
  return all.filter((b) => b.is_active === 1 && b.emails.length > 0);
}

export async function addBank(name: string, parserKey: string | null = null) {
  const existing = (await db
    .select()
    .from(banks)
    .where(sql`lower(${banks.name}) = lower(${name})`)
    .limit(1)) as Bank[];
  if (existing.length > 0) {
    throw new Error(`Bank "${name}" already exists`);
  }
  const result = await db
    .insert(banks)
    .values({ name, parser_key: parserKey, is_default: 0, is_active: 1 });
  return Number(result.lastInsertRowId);
}

export async function setBankActive(bankId: number, active: boolean) {
  return db
    .update(banks)
    .set({ is_active: active ? 1 : 0 })
    .where(eq(banks.id, bankId));
}

export async function addBankEmail(bankId: number, email: string) {
  const existing = (await db
    .select()
    .from(bankEmails)
    .where(sql`lower(${bankEmails.email}) = lower(${email})`)
    .limit(1)) as BankEmail[];
  if (existing.length > 0) {
    throw new Error(`Email "${email}" is already in use`);
  }
  return db
    .insert(bankEmails)
    .values({ bank_id: bankId, email, is_default: 0 });
}

export async function deleteBankEmail(emailId: number) {
  const [row] = (await db
    .select()
    .from(bankEmails)
    .where(eq(bankEmails.id, emailId))) as BankEmail[];
  if (!row) return;
  const remaining = (await db
    .select()
    .from(bankEmails)
    .where(eq(bankEmails.bank_id, row.bank_id))) as BankEmail[];
  if (remaining.length <= 1) return;
  return db.delete(bankEmails).where(eq(bankEmails.id, emailId));
}

export async function deleteBank(bankId: number) {
  const [row] = (await db
    .select()
    .from(banks)
    .where(eq(banks.id, bankId))) as Bank[];
  if (!row || row.is_default === 1) return;
  await db.delete(bankEmails).where(eq(bankEmails.bank_id, bankId));
  return db.delete(banks).where(eq(banks.id, bankId));
}
