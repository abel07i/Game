/**
 * Escapes a single cell for CSV export and neutralizes spreadsheet formula injection (CWE-1236).
 */
export function escapeCsvCell(value) {
  let str = (value ?? '').toString();
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  return `"${str.replace(/"/g, '""')}"`;
}

export function buildCsvContent(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  return [
    headers.map(escapeCsvCell).join(','),
    ...rows.map((row) => headers.map((h) => escapeCsvCell(row[h])).join(',')),
  ].join('\n');
}
