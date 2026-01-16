import type { InvoiceWritePayload } from './invoices';

const formatCurrency = (value: number, currency: string = 'EUR') =>
  new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(value);

const formatDate = (value?: Date) => {
  if (!value) return '';
  return value.toLocaleDateString('fr-FR');
};

const formatTime = (value?: Date) => {
  if (!value) return '';
  return value.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
};

const escapeHtml = (value: string | undefined | null) => {
  if (!value) return '';
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
};

const joinParts = (parts: Array<string | undefined | null>, separator: string) =>
  parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part && part.length > 0))
    .join(separator);

const wrapLines = (lines: Array<string | undefined | null>) =>
  lines
    .map((line) => line?.trim())
    .filter((line): line is string => Boolean(line && line.length > 0))
    .map((line) => `<div>${line}</div>`)
    .join('');

const formatSiret = (value?: string) => {
  if (!value) return undefined;
  const digits = value.replace(/\D/g, '');
  if (digits.length === 14) {
    return digits.replace(/(\d{3})(?=\d)/g, '$1 ').trim();
  }
  return value;
};

const renderLineItems = (payload: InvoiceWritePayload) =>
  payload.lineItems
    .map(
      (item) => `
        <tr>
          <td>
            ${escapeHtml(item.description)}
            ${item.taxRate ? `<div class="desc">TVA ${item.taxRate}%</div>` : ''}
          </td>
          <td class="right">${item.quantity}</td>
          <td class="right">${formatCurrency(item.unitPrice, payload.currency)}</td>
          <td class="right">${formatCurrency(item.total, payload.currency)}</td>
        </tr>
      `,
    )
    .join('');

const renderTotals = (payload: InvoiceWritePayload) => {
  const taxRate = payload.totals.taxRate ?? payload.vendorSnapshot.taxRate ?? 0;
  const rows = [`
    <div class="row"><span>Sous-total&nbsp;<small>(HT)</small></span><span>${formatCurrency(payload.totals.subtotal, payload.currency)}</span></div>
  `];

  if (payload.totals.taxAmount > 0) {
    rows.push(`
      <div class="row"><span>TVA&nbsp;<small>(${taxRate}%)</small></span><span>${formatCurrency(payload.totals.taxAmount, payload.currency)}</span></div>
    `);
  }

  rows.push('<div class="sep"></div>');
  rows.push(`
    <div class="row grand"><span>Total&nbsp;<small>(TTC)</small></span><span>${formatCurrency(payload.totals.total, payload.currency)}</span></div>
  `);

  rows.push(`
    <div class="row"><span>Déjà payé</span><span>${formatCurrency(payload.totals.depositApplied, payload.currency)}</span></div>
  `);
  rows.push('<div class="sep"></div>');
  rows.push(`
    <div class="row grand"><span>À payer</span><span>${formatCurrency(payload.totals.balanceDue, payload.currency)}</span></div>
  `);

  return rows.join('');
};

export interface InvoiceTemplateOptions {
  invoiceId: string;
}

export const generateInvoiceHtml = (
  payload: InvoiceWritePayload,
  { invoiceId }: InvoiceTemplateOptions,
): string => {
  const issuedLabel = payload.documentType === 'QUOTE' ? 'Devis' : payload.documentType === 'CREDIT_NOTE' ? 'Avoir' : 'Facture';
  const issueDate = formatDate(payload.issueDate || new Date());
  const dueDate = formatDate(payload.dueDate || payload.paymentTerms?.dueDate);
  const serviceStart = formatDate(payload.servicePeriod?.start);
  const serviceEnd = formatDate(payload.servicePeriod?.end);
  const serviceStartTime = formatTime(payload.servicePeriod?.start);
  const serviceEndTime = formatTime(payload.servicePeriod?.end);
  const vendor = payload.vendorSnapshot;
  const client = payload.clientSnapshot;

  const brandTitle = vendor.stageName || vendor.displayName || 'DJ Booker Pro';
  const vendorSubtitle = joinParts(
    [
      vendor.contactName,
      vendor.stageName && vendor.stageName !== brandTitle ? vendor.stageName : undefined,
      vendor.displayName && vendor.displayName !== brandTitle ? vendor.displayName : undefined,
    ],
    ' · ',
  );
  const registryLine = joinParts(
    [
      vendor.siret ? `SIRET : ${formatSiret(vendor.siret)}` : undefined,
      vendor.vatNumber ? `TVA : ${vendor.vatNumber}` : undefined,
    ],
    ' · ',
  );
  const contactLine = joinParts([vendor.email, vendor.phone], ' · ');
  const brandLines = wrapLines([
    vendorSubtitle ? escapeHtml(vendorSubtitle) : undefined,
    registryLine ? escapeHtml(registryLine) : undefined,
    contactLine ? escapeHtml(contactLine) : undefined,
    vendor.address ? escapeHtml(vendor.address) : undefined,
  ]);
  const showEndLine = Boolean(
    payload.servicePeriod?.end &&
      (!payload.servicePeriod.start ||
        payload.servicePeriod.end.getTime() !== payload.servicePeriod.start.getTime()),
  );
  const detailLinesHtml = wrapLines([
    `Prestation : <b>${escapeHtml(selectedBookingTitle(payload))}</b>`,
    serviceStart
      ? `Date event : <b>${serviceStart}${serviceStartTime ? ` · ${serviceStartTime}` : ''}</b>`
      : undefined,
    showEndLine
      ? `Fin : <b>${serviceEnd}${serviceEndTime ? ` · ${serviceEndTime}` : ''}</b>`
      : undefined,
    payload.bookingId ? `Référence : <b>${escapeHtml(payload.bookingId)}</b>` : undefined,
  ]);

  const notesContent = payload.notes
    ? escapeHtml(payload.notes).replace(/\n/g, '<br />')
    : 'Merci pour votre confiance.';
  const paymentInfo = vendor.iban
    ? `IBAN : ${escapeHtml(vendor.iban)}`
    : 'Ajoutez votre IBAN dans Paramètres &gt; Informations DJ pour l’afficher ici.';
  const documentTitle = issuedLabel === 'Devis' ? 'DEVIS' : issuedLabel === 'Avoir' ? 'AVOIR' : 'FACTURE';

  return `
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${documentTitle} — DJ Booker Pro</title>
  <style>
    @page { size: A4; margin: 16mm; }
    * { box-sizing: border-box; }
    html, body { height: 100%; }
    body {
      margin: 0;
      background: #f5f5f7;
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display",
                   "Segoe UI", Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji";
      color: #1d1d1f;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    .wrap {
      max-width: 880px;
      margin: 28px auto;
      padding: 0 14px;
    }
    .paper {
      background: #fff;
      border: 1px solid rgba(0,0,0,.08);
      border-radius: 18px;
      box-shadow: 0 10px 30px rgba(0,0,0,.08);
      overflow: hidden;
    }
    .pad { padding: 28px 30px; }
    .top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 18px;
      border-bottom: 1px solid rgba(0,0,0,.08);
      padding: 26px 30px;
      background: linear-gradient(180deg, rgba(245,245,247,.55), rgba(255,255,255,0));
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 260px;
    }
    .mark {
      width: 44px;
      height: 44px;
      border-radius: 14px;
      background: #1d1d1f;
      display: grid;
      place-items: center;
      color: #fff;
      font-weight: 700;
      letter-spacing: .4px;
      font-size: 14px;
    }
    .brand h1 {
      margin: 0;
      font-size: 16px;
      font-weight: 650;
      letter-spacing: -.2px;
      line-height: 1.15;
    }
    .brand-lines {
      margin-top: 6px;
      font-size: 12px;
      color: #6e6e73;
      line-height: 1.35;
      display: grid;
      gap: 4px;
    }
    .brand-lines div {
      white-space: normal;
    }
    .doc {
      text-align: right;
      min-width: 260px;
    }
    .doc .title {
      margin: 0;
      font-size: 22px;
      font-weight: 700;
      letter-spacing: -.4px;
    }
    .doc .meta {
      margin-top: 10px;
      display: inline-grid;
      gap: 6px;
      font-size: 12px;
      color: #6e6e73;
    }
    .doc .meta span {
      white-space: nowrap;
    }
    .pill {
      display: inline-block;
      padding: 6px 10px;
      border-radius: 999px;
      background: rgba(0,0,0,.06);
      color: #1d1d1f;
      font-weight: 600;
      font-size: 12px;
      letter-spacing: .2px;
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 18px;
    }
    .card {
      border: 1px solid rgba(0,0,0,.08);
      border-radius: 16px;
      padding: 16px 16px;
      background: #fff;
    }
    .card h3 {
      margin: 0 0 10px;
      font-size: 12px;
      color: #6e6e73;
      font-weight: 700;
      letter-spacing: .3px;
      text-transform: uppercase;
    }
    .kv {
      display: grid;
      gap: 7px;
      font-size: 13px;
      line-height: 1.35;
    }
    .kv b { font-weight: 650; }
    .muted { color: #6e6e73; }
    .table-wrap {
      margin-top: 18px;
      border: 1px solid rgba(0,0,0,.08);
      border-radius: 16px;
      overflow: hidden;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
      table-layout: fixed;
    }
    thead th {
      text-align: left;
      padding: 12px 14px;
      background: #fafafa;
      border-bottom: 1px solid rgba(0,0,0,.08);
      color: #6e6e73;
      font-weight: 700;
      font-size: 12px;
      letter-spacing: .25px;
      text-transform: uppercase;
    }
    thead th:nth-child(1), tbody td:nth-child(1) {
      width: 52%;
    }
    thead th:nth-child(2), thead th:nth-child(3), thead th:nth-child(4),
    tbody td:nth-child(2), tbody td:nth-child(3), tbody td:nth-child(4) {
      width: 16%;
    }
    tbody td {
      padding: 12px 14px;
      border-bottom: 1px solid rgba(0,0,0,.06);
      vertical-align: top;
    }
    tbody tr:last-child td { border-bottom: none; }
    .right { text-align: right; white-space: nowrap; }
    .desc {
      color: #6e6e73;
      font-size: 12px;
      margin-top: 3px;
      line-height: 1.35;
    }
    .bottom {
      display: grid;
      grid-template-columns: 1fr 340px;
      gap: 18px;
      margin-top: 18px;
      align-items: start;
    }
    .notes {
      border: 1px dashed rgba(0,0,0,.18);
      border-radius: 16px;
      padding: 14px 14px;
      color: #6e6e73;
      font-size: 12px;
      line-height: 1.45;
    }
    .totals {
      border: 1px solid rgba(0,0,0,.08);
      border-radius: 16px;
      padding: 14px 14px;
    }
    .totals .row {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      padding: 7px 0;
      font-size: 13px;
      color: #1d1d1f;
    }
    .totals .row span {
      white-space: nowrap;
    }
    .totals .row small { color: #6e6e73; }
    .totals .sep { height: 1px; background: rgba(0,0,0,.08); margin: 10px 0; }
    .totals .grand {
      font-size: 16px;
      font-weight: 750;
      letter-spacing: -.2px;
    }
    .foot {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 18px 30px 26px;
      border-top: 1px solid rgba(0,0,0,.08);
      color: #6e6e73;
      font-size: 12px;
      line-height: 1.4;
    }
    @media print {
      body { background: #fff; }
      .wrap { margin: 0; max-width: none; padding: 0; }
      .paper { box-shadow: none; border-radius: 0; border: none; }
      .top { background: #fff; }
      a { color: inherit; text-decoration: none; }
    }
  </style>
</head>

<body>
  <div class="wrap">
    <div class="paper">
      <div class="top">
        <div class="brand">
          <div class="mark">DJ</div>
          <div>
            <h1>${escapeHtml(brandTitle)}</h1>
            <div class="brand-lines">
              ${brandLines || `<div>Prestations DJ professionnelles</div>`}
            </div>
          </div>
        </div>

        <div class="doc">
          <p class="title">${documentTitle}</p>
          <div class="meta">
            <span class="pill">${escapeHtml(payload.number || invoiceId)}</span>
            <span>Date : ${issueDate}</span>
            ${dueDate ? `<span>Échéance : ${dueDate}</span>` : ''}
          </div>
        </div>
      </div>

      <div class="pad">
        <div class="grid">
          <div class="card">
            <h3>Facturé à</h3>
            <div class="kv">
              <div><b>${escapeHtml(client.displayName)}</b></div>
              ${client.address ? `<div class="muted">${escapeHtml(client.address)}</div>` : ''}
              ${client.contactName ? `<div>Contact : <b>${escapeHtml(client.contactName)}</b></div>` : ''}
              ${client.email ? `<div>Email : <b>${escapeHtml(client.email)}</b></div>` : ''}
              ${client.phone ? `<div>Téléphone : <b>${escapeHtml(client.phone)}</b></div>` : ''}
            </div>
          </div>

          <div class="card">
            <h3>Détails</h3>
            <div class="kv">
              ${detailLinesHtml}
            </div>
          </div>
        </div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th class="right">Qté</th>
                <th class="right">PU HT</th>
                <th class="right">Total HT</th>
              </tr>
            </thead>
            <tbody>
              ${renderLineItems(payload)}
            </tbody>
          </table>
        </div>

        <div class="bottom">
          <div class="notes">
            <b>Informations</b><br/>
            Paiement par virement : ${paymentInfo}<br/>
            ${notesContent}
          </div>

          <div class="totals">
            ${renderTotals(payload)}
          </div>
        </div>
      </div>

      <div class="foot">
        <div>${escapeHtml(vendor.displayName)} — Facturation DJ Booker Pro</div>
        <div>Conditions : paiement à réception · pénalités légales applicables.</div>
      </div>
    </div>
  </div>
</body>
</html>
`;
};

const selectedBookingTitle = (payload: InvoiceWritePayload) => {
  if (payload.lineItems.length === 1) {
    return payload.lineItems[0].description;
  }
  return 'Prestation DJ';
};
