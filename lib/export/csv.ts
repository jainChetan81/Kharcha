import { format } from "date-fns";
import { File, Paths } from "expo-file-system";
import { shareAsync } from "expo-sharing";
import type { TransactionRow } from "@/lib/db/types";
import { parseDate } from "@/lib/format";

const CSV_DATE_FORMAT = "dd/MM/yyyy";
const CSV_TIME_FORMAT = "HH:mm";

const csvEscape = (val: string) => `"${val.replace(/"/g, '""')}"`;

function buildCSV(transactions: TransactionRow[]): string {
  return [
    "Date,Time,Merchant,Amount,Type,Category,Source,Source Type,Note",
    ...transactions.map((t) => {
      const parsed = parseDate(t.date);
      return [
        csvEscape(format(parsed, CSV_DATE_FORMAT)),
        csvEscape(format(parsed, CSV_TIME_FORMAT)),
        csvEscape(t.merchant ?? ""),
        t.amount,
        csvEscape(t.type),
        csvEscape(t.category_name ?? "Other"),
        csvEscape(t.source_name ?? ""),
        csvEscape(t.source_type),
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
