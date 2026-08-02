import { format } from "date-fns";
import { File, Paths } from "expo-file-system";
import { shareAsync } from "expo-sharing";
import { CSV_DATE_FORMAT, CSV_TIME_FORMAT } from "@/lib/constants";
import type { TransactionRow } from "@/lib/db/types";
import { parseDate } from "@/lib/format";

// Cells whose value starts with =, +, -, or @ are interpreted as formulas
// by Excel / Google Sheets when the CSV is opened, regardless of the
// surrounding CSV quoting (OWASP "CSV Injection"). `merchant` is
// unconstrained free text extracted by Gemini from arbitrary SMS/email
// bodies (lib/gemini/client.ts), and `note` can be the entire raw pasted
// message verbatim (hooks/use-add-transaction.ts) — both are
// attacker-reachable if a crafted message ever gets parsed. Prefix a
// defusing single quote so the value round-trips as literal text.
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;
const csvEscape = (val: string) => {
  const safe = FORMULA_TRIGGER.test(val) ? `'${val}` : val;
  return `"${safe.replace(/"/g, '""')}"`;
};

function buildCSV(transactions: TransactionRow[]): string {
  return [
    "Date,Time,Merchant,Amount,Type,Category,Source,Destination Source,Holding,Investment Kind,Units,Source Type,Reimbursement,Reimbursable Amount,Tags,Note",
    ...transactions.map((t) => {
      const parsed = parseDate(t.date);
      return [
        csvEscape(format(parsed, CSV_DATE_FORMAT)),
        csvEscape(format(parsed, CSV_TIME_FORMAT)),
        csvEscape(t.merchant ?? ""),
        t.amount,
        csvEscape(t.type),
        csvEscape(
          t.type === "transfer" || t.type === "investment"
            ? ""
            : (t.category_name ?? "Other"),
        ),
        csvEscape(t.source_name ?? ""),
        csvEscape(t.destination_source_name ?? ""),
        csvEscape(t.holding_name ?? ""),
        csvEscape(t.investment_kind ?? ""),
        t.units ?? "",
        csvEscape(t.source_type),
        csvEscape(
          t.reimbursement_status === "none" ? "" : t.reimbursement_status,
        ),
        t.reimbursable_amount ?? "",
        csvEscape(t.tags.map((tag) => tag.name).join("; ")),
        csvEscape(t.note ?? ""),
      ].join(",");
    }),
  ].join("\n");
}

export async function exportToCSV(
  transactions: TransactionRow[],
  filename = "kharcha-export",
): Promise<void> {
  const csv = buildCSV(transactions);
  const file = new File(Paths.cache, `${filename}.csv`);
  file.write(csv);
  await shareAsync(file.uri, {
    mimeType: "text/csv",
    UTI: "public.comma-separated-values-text",
  });
}
