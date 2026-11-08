import ExcelJS from 'exceljs';
import {
  DISCLAIMER,
  displayTicker,
  DIVIDENDS_NOTE,
  FEES_NOTE,
  formatDate,
  formatDateTime,
  KIND_LABEL,
  METHOD_LABEL,
  type ReportData,
} from './report-data.js';

type ColumnType = 'text' | 'date' | 'money' | 'qty' | 'price';

interface Column<T> {
  header: string;
  width: number;
  type: ColumnType;
  value: (row: T) => string | number | Date | null;
  /** Adds a SUM formula under this column. */
  total?: boolean;
}

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF1F2937' },
};
const TOTAL_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFF3F4F6' },
};

export async function buildXlsx(data: ReportData): Promise<Buffer> {
  const { meta } = data;
  const tz = meta.timeZone;
  const money =
    meta.currency === 'EUR'
      ? '#,##0.00 "€";[Red]-#,##0.00 "€"'
      : `#,##0.00 "${meta.currency}";[Red]-#,##0.00 "${meta.currency}"`;
  const formats: Record<ColumnType, string | undefined> = {
    text: undefined,
    date: 'dd/mm/yyyy hh:mm',
    money,
    qty: '#,##0.00######',
    price: '#,##0.00####',
  };
  // Excel has no time zones: write the local wall-clock time of the tax time zone.
  const local = (d: Date) => {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
        .formatToParts(d)
        .map((p) => [p.type, p.value]),
    );
    return new Date(
      Date.UTC(
        +parts.year,
        +parts.month - 1,
        +parts.day,
        +parts.hour % 24,
        +parts.minute,
      ),
    );
  };
  const num = (v: string | null) => (v === null || v === '' ? null : Number(v));

  const wb = new ExcelJS.Workbook();
  wb.creator = 't212-ledger';
  wb.created = meta.generatedAt;

  function addTable<T>(
    name: string,
    title: string,
    columns: Column<T>[],
    rows: T[],
  ): ExcelJS.Worksheet {
    const ws = wb.addWorksheet(name, {
      views: [{ state: 'frozen', ySplit: 3 }],
    });
    ws.columns = columns.map((c) => ({
      width: c.width,
      style: { numFmt: formats[c.type] },
    }));
    ws.getCell('A1').value = title;
    ws.getCell('A1').font = { bold: true, size: 13 };

    const header = ws.getRow(3);
    columns.forEach((c, i) => {
      const cell = header.getCell(i + 1);
      cell.value = c.header;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = HEADER_FILL;
      cell.alignment = { vertical: 'middle', wrapText: true };
    });
    header.height = 30;

    rows.forEach((row, r) => {
      const excelRow = ws.getRow(4 + r);
      columns.forEach((c, i) => {
        const v = c.value(row);
        excelRow.getCell(i + 1).value = v instanceof Date ? local(v) : v;
      });
    });

    if (rows.length === 0) {
      ws.getCell('A4').value = 'Καμία εγγραφή για την περίοδο.';
      ws.getCell('A4').font = { italic: true, color: { argb: 'FF6B7280' } };
    } else if (columns.some((c) => c.total)) {
      const totalRow = ws.getRow(4 + rows.length);
      totalRow.getCell(1).value = 'Σύνολο';
      columns.forEach((c, i) => {
        const cell = totalRow.getCell(i + 1);
        cell.fill = TOTAL_FILL;
        cell.font = { bold: true };
        if (!c.total) return;
        const col = ws.getColumn(i + 1).letter;
        const result = rows.reduce(
          (s, row) => s + (Number(c.value(row)) || 0),
          0,
        );
        cell.value = {
          formula: `SUM(${col}4:${col}${3 + rows.length})`,
          result: Math.round(result * 100) / 100,
        };
      });
    }
    ws.autoFilter = {
      from: { row: 3, column: 1 },
      to: { row: 3, column: columns.length },
    };
    return ws;
  }

  // ── Σύνοψη ────────────────────────────────────────────────────────────────
  const period =
    meta.year === null ? 'Όλο το ιστορικό' : `Φορολογικό έτος ${meta.year}`;
  const summary = addTable(
    'Σύνοψη',
    `Trading 212 · ${meta.accountLabel} · ${period}`,
    [
      { header: 'Έτος', width: 10, type: 'text', value: (y) => y.year },
      {
        header: 'Καταθέσεις',
        width: 15,
        type: 'money',
        value: (y) => num(y.deposits),
        total: true,
      },
      {
        header: 'Αναλήψεις',
        width: 15,
        type: 'money',
        value: (y) => num(y.withdrawals),
        total: true,
      },
      {
        header: 'Αγορές (με χρεώσεις)',
        width: 18,
        type: 'money',
        value: (y) => num(y.purchases),
        total: true,
      },
      {
        header: 'Έσοδα πωλήσεων (μετά χρεώσεων)',
        width: 20,
        type: 'money',
        value: (y) => num(y.saleProceeds),
        total: true,
      },
      {
        header: 'Αποτέλεσμα πωλήσεων',
        width: 18,
        type: 'money',
        value: (y) => num(y.realisedPnl),
        total: true,
      },
      {
        header: 'Μερίσματα (καθαρά)',
        width: 16,
        type: 'money',
        value: (y) => num(y.dividends),
        total: true,
      },
      {
        header: 'Μερίσματα μικτά (εκτίμηση)',
        width: 16,
        type: 'money',
        value: (y) => num(data.dividendTax.get(y.year)?.gross ?? null),
        total: true,
      },
      {
        header: 'Φόρος εξωτερικού (εκτίμηση)',
        width: 16,
        type: 'money',
        value: (y) => num(data.dividendTax.get(y.year)?.withheld ?? null),
        total: true,
      },
      {
        header: 'Τόκοι',
        width: 12,
        type: 'money',
        value: (y) => num(y.interest),
        total: true,
      },
      {
        header: 'Χρεώσεις',
        width: 12,
        type: 'money',
        value: (y) => num(y.fees),
        total: true,
      },
    ],
    data.years,
  );
  const info: [string, string][] = [
    [
      'Λογαριασμός',
      `${meta.accountLabel} (${meta.environment === 'DEMO' ? 'Practice' : 'Πραγματικά χρήματα'})`,
    ],
    ['Νόμισμα λογαριασμού', meta.currency],
    ['Μέθοδος κόστους κτήσης', METHOD_LABEL[meta.method]],
    ['Ώρα αναφοράς', `${meta.timeZone} (τα έτη κόβονται με τοπική ώρα)`],
    [
      'Δραστηριότητα',
      meta.firstActivity && meta.lastActivity
        ? `${formatDate(meta.firstActivity, tz)} – ${formatDate(meta.lastActivity, tz)}`
        : '—',
    ],
    ['Δημιουργήθηκε', formatDateTime(meta.generatedAt, tz)],
    [
      'Προειδοποιήσεις',
      data.warnings.length
        ? `${data.warnings.length} (βλ. φύλλο «Έλεγχος»)`
        : 'Καμία',
    ],
    ['Σημείωση', FEES_NOTE],
    ['Μερίσματα', DIVIDENDS_NOTE],
    ['Αποποίηση', DISCLAIMER],
  ];
  let r = 4 + data.years.length + 3;
  for (const [label, value] of info) {
    summary.getCell(`A${r}`).value = label;
    summary.getCell(`A${r}`).font = { bold: true };
    summary.mergeCells(`B${r}:K${r}`);
    summary.getCell(`B${r}`).value = value;
    summary.getCell(`B${r}`).alignment = { wrapText: true, vertical: 'top' };
    if (value.length > 90) summary.getRow(r).height = 32;
    r++;
  }

  // ── Πωλήσεις ──────────────────────────────────────────────────────────────
  addTable(
    'Πωλήσεις',
    `Πωλήσεις και αποτέλεσμα · ${period} · ${METHOD_LABEL[meta.method]}`,
    [
      { header: 'Ημερομηνία', width: 17, type: 'date', value: (s) => s.date },
      {
        header: 'Ticker',
        width: 10,
        type: 'text',
        value: (s) => displayTicker(s.ticker),
      },
      { header: 'ISIN', width: 15, type: 'text', value: (s) => s.isin },
      {
        header: 'Τίτλος',
        width: 30,
        type: 'text',
        value: (s) => s.instrumentName,
      },
      {
        header: 'Ποσότητα',
        width: 13,
        type: 'qty',
        value: (s) => num(s.quantity),
      },
      {
        header: 'Έσοδο (μετά χρεώσεων)',
        width: 15,
        type: 'money',
        value: (s) => num(s.proceeds),
        total: true,
      },
      {
        header: 'Κόστος κτήσης',
        width: 15,
        type: 'money',
        value: (s) => num(s.costBasis),
        total: true,
      },
      {
        header: 'Αποτέλεσμα',
        width: 14,
        type: 'money',
        value: (s) => num(s.realisedPnl),
        total: true,
      },
      {
        header: 'Χρεώσεις πώλησης',
        width: 12,
        type: 'money',
        value: (s) => num(s.sellFees),
        total: true,
      },
      {
        header: 'Αποτέλεσμα κατά T212 (χωρίς χρεώσεις)',
        width: 16,
        type: 'money',
        value: (s) => num(s.brokerRealisedPnl),
        total: true,
      },
    ],
    data.sales,
  );

  // ── Αγορές ────────────────────────────────────────────────────────────────
  addTable(
    'Αγορές',
    `Αγορές τίτλων · ${period}`,
    [
      {
        header: 'Ημερομηνία',
        width: 17,
        type: 'date',
        value: (e) => e.occurredAt,
      },
      {
        header: 'Ticker',
        width: 10,
        type: 'text',
        value: (e) => displayTicker(e.displayTicker ?? e.ticker),
      },
      { header: 'ISIN', width: 15, type: 'text', value: (e) => e.isin },
      {
        header: 'Τίτλος',
        width: 30,
        type: 'text',
        value: (e) => e.instrumentName,
      },
      {
        header: 'Ποσότητα',
        width: 13,
        type: 'qty',
        value: (e) => num(e.quantity),
      },
      { header: 'Τιμή', width: 11, type: 'price', value: (e) => num(e.price) },
      {
        header: 'Νόμισμα τίτλου',
        width: 9,
        type: 'text',
        value: (e) => e.instrumentCurrency,
      },
      {
        header: 'Ισοτιμία',
        width: 11,
        type: 'price',
        value: (e) => num(e.fxRate),
      },
      {
        header: 'Χρεώσεις',
        width: 11,
        type: 'money',
        value: (e) => num(e.fees),
        total: true,
      },
      {
        header: 'Συνολικό κόστος',
        width: 15,
        type: 'money',
        value: (e) => Math.abs(Number(e.cashAmount)),
        total: true,
      },
    ],
    data.buys,
  );

  // ── Μερίσματα ─────────────────────────────────────────────────────────────
  addTable(
    'Μερίσματα',
    `Μερίσματα · ${period}`,
    [
      { header: 'Ημερομηνία', width: 17, type: 'date', value: (d) => d.date },
      {
        header: 'Ticker',
        width: 10,
        type: 'text',
        value: (d) => displayTicker(d.ticker),
      },
      { header: 'ISIN', width: 15, type: 'text', value: (d) => d.isin },
      {
        header: 'Τίτλος',
        width: 28,
        type: 'text',
        value: (d) => d.instrumentName,
      },
      {
        header: 'Μετοχές',
        width: 12,
        type: 'qty',
        value: (d) => num(d.shares),
      },
      {
        header: 'Μικτό (νόμισμα τίτλου)',
        width: 13,
        type: 'price',
        value: (d) => num(d.grossInstrument),
      },
      {
        header: 'Νόμισμα',
        width: 8,
        type: 'text',
        value: (d) => d.instrumentCurrency,
      },
      {
        header: 'Ισοτιμία',
        width: 10,
        type: 'price',
        value: (d) => num(d.fxRate),
      },
      {
        header: 'Μικτό σε € (εκτίμηση)',
        width: 14,
        type: 'money',
        value: (d) => num(d.grossAccount),
        total: true,
      },
      {
        header: 'Φόρος εξωτερικού (εκτίμηση)',
        width: 14,
        type: 'money',
        value: (d) => num(d.withheld),
        total: true,
      },
      {
        header: 'Ποσοστό %',
        width: 9,
        type: 'price',
        value: (d) => num(d.withholdingRate),
      },
      {
        header: 'Καθαρό που πιστώθηκε',
        width: 14,
        type: 'money',
        value: (d) => num(d.net),
        total: true,
      },
    ],
    data.dividends,
  );
  if (data.dividends.length) {
    const ws = wb.getWorksheet('Μερίσματα')!;
    const r = 4 + data.dividends.length + 2;
    ws.mergeCells(`A${r}:L${r}`);
    ws.getCell(`A${r}`).value = DIVIDENDS_NOTE;
    ws.getCell(`A${r}`).alignment = { wrapText: true, vertical: 'top' };
    ws.getCell(`A${r}`).font = { italic: true, color: { argb: 'FF4B5563' } };
    ws.getRow(r).height = 32;
  }

  // ── Μετρητά ───────────────────────────────────────────────────────────────
  addTable(
    'Μετρητά',
    `Καταθέσεις, αναλήψεις, τόκοι και χρεώσεις · ${period}`,
    [
      {
        header: 'Ημερομηνία',
        width: 17,
        type: 'date',
        value: (e) => e.occurredAt,
      },
      {
        header: 'Είδος',
        width: 16,
        type: 'text',
        value: (e) => KIND_LABEL[e.kind],
      },
      {
        header: 'Ποσό',
        width: 14,
        type: 'money',
        value: (e) => num(e.cashAmount),
        total: true,
      },
      {
        header: 'Τύπος Trading 212',
        width: 22,
        type: 'text',
        value: (e) => e.sourceType,
      },
    ],
    data.cashMovements,
  );

  // ── Θέσεις ────────────────────────────────────────────────────────────────
  addTable(
    'Θέσεις',
    `${data.closingHoldingsTitle} (κόστος κτήσης)`,
    [
      {
        header: 'Ticker',
        width: 10,
        type: 'text',
        value: (h) => displayTicker(h.ticker),
      },
      { header: 'ISIN', width: 15, type: 'text', value: (h) => h.isin },
      {
        header: 'Τίτλος',
        width: 30,
        type: 'text',
        value: (h) => h.instrumentName,
      },
      {
        header: 'Ποσότητα',
        width: 14,
        type: 'qty',
        value: (h) => num(h.quantity),
      },
      {
        header: 'Κόστος κτήσης',
        width: 15,
        type: 'money',
        value: (h) => num(h.costBasis),
        total: true,
      },
      {
        header: 'Μέση τιμή ανά μετοχή',
        width: 15,
        type: 'money',
        value: (h) => num(h.averageCost),
      },
    ],
    data.closingHoldings,
  );

  // ── Όλες οι κινήσεις ──────────────────────────────────────────────────────
  addTable(
    'Όλες οι κινήσεις',
    `Πλήρες ημερολόγιο κινήσεων · ${period}`,
    [
      {
        header: 'Ημερομηνία',
        width: 17,
        type: 'date',
        value: (e) => e.occurredAt,
      },
      {
        header: 'Είδος',
        width: 16,
        type: 'text',
        value: (e) => KIND_LABEL[e.kind],
      },
      {
        header: 'Ticker',
        width: 10,
        type: 'text',
        value: (e) => displayTicker(e.displayTicker ?? e.ticker),
      },
      { header: 'ISIN', width: 15, type: 'text', value: (e) => e.isin },
      {
        header: 'Τίτλος',
        width: 30,
        type: 'text',
        value: (e) => e.instrumentName,
      },
      {
        header: 'Ποσότητα',
        width: 13,
        type: 'qty',
        value: (e) => num(e.quantity),
      },
      { header: 'Τιμή', width: 11, type: 'price', value: (e) => num(e.price) },
      {
        header: 'Νόμισμα τίτλου',
        width: 9,
        type: 'text',
        value: (e) => e.instrumentCurrency,
      },
      {
        header: 'Κίνηση μετρητών',
        width: 15,
        type: 'money',
        value: (e) => num(e.cashAmount),
      },
      {
        header: 'Χρεώσεις',
        width: 11,
        type: 'money',
        value: (e) => num(e.fees),
      },
      {
        header: 'Τύπος Trading 212',
        width: 20,
        type: 'text',
        value: (e) => e.sourceType,
      },
    ],
    data.entries,
  );

  // ── Έλεγχος ───────────────────────────────────────────────────────────────
  if (data.warnings.length || data.corporateActions.length) {
    addTable(
      'Έλεγχος',
      'Εγγραφές που χρειάζονται έλεγχο',
      [
        { header: 'Ημερομηνία', width: 17, type: 'date', value: (w) => w.date },
        {
          header: 'Περιγραφή',
          width: 100,
          type: 'text',
          value: (w) => w.message,
        },
      ],
      [
        ...data.warnings,
        ...data.corporateActions.map((e) => ({
          entryId: e.id,
          date: e.occurredAt,
          message: `${displayTicker(e.displayTicker ?? e.ticker)}: εταιρική πράξη ${e.sourceType}, ποσότητα ${e.quantity}`,
        })),
      ],
    );
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}
