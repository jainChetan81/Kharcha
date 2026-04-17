export function parseAmount(str: string): number {
  return Number.parseFloat(str.replace(/,/g, ""));
}

export function parseAxisDate(rawDate: string): string {
  const [day, month, year] = rawDate.split("-");
  const fullYear = year.length === 2 ? `20${year}` : year;
  return `${fullYear}-${month}-${day}`;
}

export function parseHdfcDate(rawDate: string): string {
  const months: Record<string, string> = {
    jan: "01",
    feb: "02",
    mar: "03",
    apr: "04",
    may: "05",
    jun: "06",
    jul: "07",
    aug: "08",
    sep: "09",
    oct: "10",
    nov: "11",
    dec: "12",
  };
  const match = rawDate.match(/(\d{2})\s+(\w{3}),?\s+(\d{4})/);
  if (!match) return today();
  const [, day, mon, year] = match;
  return `${year}-${months[mon.toLowerCase()] ?? "01"}-${day}`;
}

export function today(): string {
  return new Date().toISOString().split("T")[0];
}
