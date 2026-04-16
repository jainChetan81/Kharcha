import { eq, sql } from "drizzle-orm";
import { db } from "./connection";
import { bankEmails, banks } from "./schema";
import type { Bank, BankEmail, BankWithEmails } from "./types";

export async function getAllBanksWithEmails(): Promise<BankWithEmails[]> {
  const rows = await db
    .select({
      bank_id: banks.id,
      bank_name: banks.name,
      parser_key: banks.parser_key,
      is_default: banks.is_default,
      is_active: banks.is_active,
      email_id: bankEmails.id,
      email: bankEmails.email,
      email_is_default: bankEmails.is_default,
    })
    .from(banks)
    .leftJoin(bankEmails, eq(banks.id, bankEmails.bank_id));

  // Group by bank
  const bankMap = new Map<number, { bank: Bank; emails: BankEmail[] }>();
  for (const row of rows) {
    if (!bankMap.has(row.bank_id)) {
      bankMap.set(row.bank_id, {
        bank: {
          id: row.bank_id,
          name: row.bank_name,
          parser_key: row.parser_key,
          is_default: row.is_default,
          is_active: row.is_active,
        },
        emails: [],
      });
    }
    if (row.email_id != null) {
      bankMap.get(row.bank_id)?.emails.push({
        id: row.email_id,
        bank_id: row.bank_id,
        email: row.email ?? "",
        is_default: row.email_is_default,
      });
    }
  }

  return Array.from(bankMap.values()).map((item) => ({
    ...item.bank,
    emails: item.emails,
  }));
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
