import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import pdfmake from 'pdfmake';
import type {
  Content,
  TableCell,
  TDocumentDefinitions,
} from 'pdfmake/interfaces.js';
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

const fontDir = join(
  dirname(createRequire(import.meta.url).resolve('pdfmake/package.json')),
  'fonts',
  'Roboto',
);
pdfmake.setFonts({
  // Roboto ships with pdfmake and covers Greek.
  Roboto: {
    normal: join(fontDir, 'Roboto-Regular.ttf'),
    bold: join(fontDir, 'Roboto-Medium.ttf'),
    italics: join(fontDir, 'Roboto-Italic.ttf'),
    bolditalics: join(fontDir, 'Roboto-MediumItalic.ttf'),
  },
});
// Documents only ever read the bundled fonts from disk.
pdfmake.setLocalAccessPolicy((path) => path.startsWith(fontDir));
pdfmake.setUrlAccessPolicy(() => false);

interface Col<T> {
  header: string;
  width: number | '*' | 'auto';
  value: (row: T) => string;
  align?: 'right';
  /** Adds a total row; receives all rows. */
  total?: (rows: T[]) => string;
}

export async function buildPdf(data: ReportData): Promise<Buffer> {
  const { meta } = data;
  const tz = meta.timeZone;
  const moneyFmt = new Intl.NumberFormat('el-GR', {
    style: 'currency',
    currency: meta.currency,
  });
  const qtyFmt = new Intl.NumberFormat('el-GR', { maximumFractionDigits: 8 });
  const money = (v: string | number | null) =>
    v === null || v === '' ? '' : moneyFmt.format(Number(v));
  const qty = (v: string | null) =>
    v === null ? '' : qtyFmt.format(Number(v));
  const sum = <T>(rows: T[], pick: (r: T) => string | number | null) =>
    money(rows.reduce((s, r) => s + (Number(pick(r)) || 0), 0));
  const period =
    meta.year === null ? 'Όλο το ιστορικό' : `Φορολογικό έτος ${meta.year}`;

  function table<T>(
    title: string,
    cols: Col<T>[],
    rows: T[],
    subtitle?: string,
  ): Content[] {
    const head: TableCell[] = cols.map((c) => ({
      text: c.header,
      style: 'th',
      alignment: c.align,
    }));
    const body: TableCell[][] = rows.map((r) =>
      cols.map((c) => ({ text: c.value(r), alignment: c.align })),
    );
    if (rows.length && cols.some((c) => c.total)) {
      body.push(
        cols.map((c, i) => ({
          text: c.total ? c.total(rows) : i === 0 ? 'Σύνολο' : '',
          bold: true,
          alignment: c.align,
          fillColor: '#F3F4F6',
        })),
      );
    }
    return [
      { text: title, style: 'h2', pageBreak: 'before' },
      ...(subtitle ? [{ text: subtitle, style: 'muted' } as Content] : []),
      rows.length
        ? {
            table: {
              headerRows: 1,
              widths: cols.map((c) => c.width),
              body: [head, ...body],
            },
            layout: 'lightHorizontalLines',
          }
        : {
            text: 'Καμία εγγραφή για την περίοδο.',
            italics: true,
            color: '#6B7280',
          },
    ];
  }

  const summaryRows: TableCell[][] = [
    [
      'Έτος',
      'Καταθέσεις',
      'Αναλήψεις',
      'Αγορές',
      'Έσοδα πωλήσεων',
      'Αποτέλεσμα πωλήσεων',
      'Μερίσματα',
      'Τόκοι',
      'Χρεώσεις',
    ].map((h, i) => ({
      text: h,
      style: 'th',
      alignment: i ? 'right' : undefined,
    })),
    ...data.years.map((y) => [
      String(y.year),
      ...[
        y.deposits,
        y.withdrawals,
        y.purchases,
        y.saleProceeds,
        y.realisedPnl,
        y.dividends,
        y.interest,
        y.fees,
      ].map((v) => ({ text: money(v), alignment: 'right' as const })),
    ]),
  ];
  if (data.years.length > 1) {
    const t = data.totals;
    summaryRows.push([
      { text: 'Σύνολο', bold: true },
      ...[
        t.deposits,
        t.withdrawals,
        t.purchases,
        t.saleProceeds,
        t.realisedPnl,
        t.dividends,
        t.interest,
        t.fees,
      ].map((v) => ({
        text: money(v),
        alignment: 'right' as const,
        bold: true,
      })),
    ]);
  }

  const info: [string, string][] = [
    [
      'Λογαριασμός',
      `${meta.accountLabel} (${meta.environment === 'DEMO' ? 'Practice' : 'Πραγματικά χρήματα'})`,
    ],
    ['Μέθοδος κόστους κτήσης', METHOD_LABEL[meta.method]],
    [
      'Δραστηριότητα',
      meta.firstActivity && meta.lastActivity
        ? `${formatDate(meta.firstActivity, tz)} – ${formatDate(meta.lastActivity, tz)}`
        : '—',
    ],
    ['Δημιουργήθηκε', `${formatDateTime(meta.generatedAt, tz)} (${tz})`],
  ];

  const content: Content[] = [
    { text: 'Αναφορά επενδυτικού λογαριασμού Trading 212', style: 'h1' },
    { text: period, style: 'subtitle' },
    {
      table: {
        widths: [150, '*'],
        body: info.map(([k, v]) => [{ text: k, bold: true }, v]),
      },
      layout: 'noBorders',
      margin: [0, 0, 0, 16],
    },
    { text: 'Σύνοψη ανά έτος', style: 'h2' },
    {
      table: {
        headerRows: 1,
        widths: [40, '*', '*', '*', '*', '*', '*', '*', '*'],
        body: summaryRows,
      },
      layout: 'lightHorizontalLines',
    },
    ...[...data.dividendTax.entries()]
      .filter(([, t]) => Number(t.gross) > 0)
      .map(([year, t]): Content => ({
        text: [
          { text: `Μερίσματα ${year}: `, bold: true },
          `μικτά ~${money(t.gross)}, φόρος που παρακρατήθηκε στο εξωτερικό ~${money(t.withheld)} (εκτίμηση${t.partial ? ', ελλιπής' : ''}).`,
        ],
        style: 'note',
        margin: [0, 10, 0, 0],
      })),
    { text: FEES_NOTE, style: 'note', margin: [0, 14, 0, 4] },
    data.warnings.length
      ? {
          text: `Υπάρχουν ${data.warnings.length} εγγραφές που χρειάζονται έλεγχο (τελευταία σελίδα).`,
          style: 'note',
          color: '#B45309',
        }
      : '',
    { text: DISCLAIMER, style: 'note', italics: true },

    ...table(
      'Πωλήσεις',
      [
        {
          header: 'Ημερομηνία',
          width: 58,
          value: (s) => formatDate(s.date, tz),
        },
        { header: 'Ticker', width: 45, value: (s) => displayTicker(s.ticker) },
        { header: 'ISIN', width: 78, value: (s) => s.isin ?? '' },
        { header: 'Τίτλος', width: '*', value: (s) => s.instrumentName ?? '' },
        {
          header: 'Ποσότητα',
          width: 62,
          align: 'right',
          value: (s) => qty(s.quantity),
        },
        {
          header: 'Έσοδο',
          width: 62,
          align: 'right',
          value: (s) => money(s.proceeds),
          total: (r) => sum(r, (s) => s.proceeds),
        },
        {
          header: 'Κόστος',
          width: 62,
          align: 'right',
          value: (s) => money(s.costBasis),
          total: (r) => sum(r, (s) => s.costBasis),
        },
        {
          header: 'Αποτέλεσμα',
          width: 62,
          align: 'right',
          value: (s) => money(s.realisedPnl),
          total: (r) => sum(r, (s) => s.realisedPnl),
        },
        {
          header: 'Χρεώσεις',
          width: 48,
          align: 'right',
          value: (s) => money(s.sellFees),
          total: (r) => sum(r, (s) => s.sellFees),
        },
      ],
      data.sales,
      `${METHOD_LABEL[meta.method]}. Έσοδο μετά χρεώσεων, κόστος με χρεώσεις αγοράς.`,
    ),

    ...table(
      'Αγορές',
      [
        {
          header: 'Ημερομηνία',
          width: 58,
          value: (e) => formatDate(e.occurredAt, tz),
        },
        {
          header: 'Ticker',
          width: 45,
          value: (e) => displayTicker(e.displayTicker ?? e.ticker),
        },
        { header: 'ISIN', width: 78, value: (e) => e.isin ?? '' },
        { header: 'Τίτλος', width: '*', value: (e) => e.instrumentName ?? '' },
        {
          header: 'Ποσότητα',
          width: 62,
          align: 'right',
          value: (e) => qty(e.quantity),
        },
        {
          header: 'Τιμή',
          width: 62,
          align: 'right',
          value: (e) =>
            e.price ? `${qty(e.price)} ${e.instrumentCurrency ?? ''}` : '',
        },
        {
          header: 'Χρεώσεις',
          width: 48,
          align: 'right',
          value: (e) => money(e.fees),
          total: (r) => sum(r, (e) => e.fees),
        },
        {
          header: 'Κόστος',
          width: 62,
          align: 'right',
          value: (e) => money(Math.abs(Number(e.cashAmount))),
          total: (r) => sum(r, (e) => Math.abs(Number(e.cashAmount))),
        },
      ],
      data.buys,
    ),

    ...table(
      'Μερίσματα',
      [
        {
          header: 'Ημερομηνία',
          width: 54,
          value: (d) => formatDate(d.date, tz),
        },
        { header: 'Ticker', width: 40, value: (d) => displayTicker(d.ticker) },
        { header: 'ISIN', width: 74, value: (d) => d.isin ?? '' },
        { header: 'Τίτλος', width: '*', value: (d) => d.instrumentName ?? '' },
        {
          header: 'Μικτό (τίτλου)',
          width: 64,
          align: 'right',
          value: (d) =>
            d.grossInstrument
              ? `${qty(d.grossInstrument)} ${d.instrumentCurrency ?? ''}`
              : '',
        },
        {
          header: 'Μικτό € (εκτ.)',
          width: 58,
          align: 'right',
          value: (d) => money(d.grossAccount),
          total: (r) => sum(r, (d) => d.grossAccount),
        },
        {
          header: 'Φόρος (εκτ.)',
          width: 54,
          align: 'right',
          value: (d) => money(d.withheld),
          total: (r) => sum(r, (d) => d.withheld),
        },
        {
          header: '%',
          width: 30,
          align: 'right',
          value: (d) => (d.withholdingRate ? `${d.withholdingRate}` : ''),
        },
        {
          header: 'Καθαρό',
          width: 54,
          align: 'right',
          value: (d) => money(d.net),
          total: (r) => sum(r, (d) => d.net),
        },
      ],
      data.dividends,
      DIVIDENDS_NOTE,
    ),

    ...table(
      'Καταθέσεις, αναλήψεις, τόκοι και χρεώσεις',
      [
        {
          header: 'Ημερομηνία',
          width: 80,
          value: (e) => formatDateTime(e.occurredAt, tz),
        },
        { header: 'Είδος', width: 110, value: (e) => KIND_LABEL[e.kind] },
        { header: 'Τύπος Trading 212', width: '*', value: (e) => e.sourceType },
        {
          header: 'Ποσό',
          width: 80,
          align: 'right',
          value: (e) => money(e.cashAmount),
          total: (r) => sum(r, (e) => e.cashAmount),
        },
      ],
      data.cashMovements,
    ),

    ...table(
      data.closingHoldingsTitle,
      [
        { header: 'Ticker', width: 45, value: (h) => displayTicker(h.ticker) },
        { header: 'ISIN', width: 78, value: (h) => h.isin ?? '' },
        { header: 'Τίτλος', width: '*', value: (h) => h.instrumentName ?? '' },
        {
          header: 'Ποσότητα',
          width: 70,
          align: 'right',
          value: (h) => qty(h.quantity),
        },
        {
          header: 'Μέση τιμή',
          width: 70,
          align: 'right',
          value: (h) => money(h.averageCost),
        },
        {
          header: 'Κόστος κτήσης',
          width: 80,
          align: 'right',
          value: (h) => money(h.costBasis),
          total: (r) => sum(r, (h) => h.costBasis),
        },
      ],
      data.closingHoldings,
      'Σε κόστος κτήσης, όχι σε τρέχουσα αξία.',
    ),

    ...(data.warnings.length || data.corporateActions.length
      ? table(
          'Εγγραφές προς έλεγχο',
          [
            {
              header: 'Ημερομηνία',
              width: 70,
              value: (w: { date: Date; message: string }) =>
                formatDate(w.date, tz),
            },
            {
              header: 'Περιγραφή',
              width: '*',
              value: (w: { date: Date; message: string }) => w.message,
            },
          ],
          [
            ...data.warnings,
            ...data.corporateActions.map((e) => ({
              date: e.occurredAt,
              message: `${displayTicker(e.displayTicker ?? e.ticker)}: εταιρική πράξη ${e.sourceType}, ποσότητα ${e.quantity}`,
            })),
          ],
        )
      : []),
  ];

  const doc: TDocumentDefinitions = {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [36, 36, 36, 40],
    info: {
      title: `Trading 212 – ${meta.accountLabel} – ${period}`,
      creator: 't212-ledger',
    },
    defaultStyle: { font: 'Roboto', fontSize: 8.5 },
    styles: {
      h1: { fontSize: 17, bold: true },
      subtitle: { fontSize: 12, color: '#374151', margin: [0, 2, 0, 12] },
      h2: { fontSize: 12.5, bold: true, margin: [0, 0, 0, 6] },
      th: { bold: true, color: '#111827' },
      muted: { color: '#6B7280', margin: [0, 0, 0, 6] },
      note: { fontSize: 8, color: '#4B5563', margin: [0, 2, 0, 2] },
    },
    footer: (page, pages) => ({
      columns: [
        { text: `${meta.accountLabel} · ${period}`, color: '#9CA3AF' },
        {
          text: `Σελίδα ${page} από ${pages}`,
          alignment: 'right',
          color: '#9CA3AF',
        },
      ],
      margin: [36, 10, 36, 0],
      fontSize: 7.5,
    }),
    content,
  };

  return pdfmake.createPdf(doc).getBuffer();
}
