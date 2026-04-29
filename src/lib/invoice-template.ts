import type { InvoiceWritePayload } from './invoices';

const formatCurrency = (value: number, currency: string = 'EUR') =>
  new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(value);

const formatDate = (value?: Date) => {
  if (!value) return '';
  return value.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
};

const formatTime = (value?: Date) => {
  if (!value) return '';
  if (value.getHours() === 0 && value.getMinutes() === 0) return '';
  return value.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
};

const escapeHtml = (value: string | undefined | null) => {
  if (!value) return '';
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
};

const formatSiret = (value?: string) => {
  if (!value) return undefined;
  const digits = value.replace(/\D/g, '');
  if (digits.length === 14) {
    return digits.replace(/(\d{3})(?=\d)/g, '$1 ').trim();
  }
  return value;
};

export interface InvoiceTemplateOptions {
  invoiceId: string;
}

export const generateInvoiceHtml = (
  payload: InvoiceWritePayload,
  { invoiceId }: InvoiceTemplateOptions,
): string => {
  const issuedLabel = payload.documentType === 'QUOTE' ? 'Devis' : payload.documentType === 'CREDIT_NOTE' ? 'Avoir' : 'Facture';
  const documentTitle = issuedLabel === 'Devis' ? 'DEVIS' : issuedLabel === 'Avoir' ? 'AVOIR' : 'FACTURE';
  const issueDate = formatDate(payload.issueDate || new Date());
  const dueDate = formatDate(payload.dueDate || payload.paymentTerms?.dueDate);
  const serviceStart = formatDate(payload.servicePeriod?.start);
  const serviceStartTime = formatTime(payload.servicePeriod?.start);

  const vendor = payload.vendorSnapshot;
  const client = payload.clientSnapshot;
  const taxRate = payload.totals.taxRate ?? vendor.taxRate ?? 0;
  const isVatExempt = taxRate === 0;

  const brandTitle = vendor.stageName || vendor.displayName || 'DJ Booker Pro';
  const brandInitials = brandTitle.split(' ').map(w => w[0]).join('').substring(0, 3).toUpperCase();

  // Vendor address parts
  const vendorAddress = vendor.address || '';
  const vendorPostalCity = [vendor.postalCode, vendor.city].filter(Boolean).join(' ');

  // Client address parts
  const clientAddress = client.address || '';
  const clientPostalCity = [client.postalCode, client.city].filter(Boolean).join(' ');

  // Service period display
  let prestationDateLine = '';
  const hasMultipleDates = payload.servicePeriods && payload.servicePeriods.length > 1;
  if (hasMultipleDates) {
    const dateLines = payload.servicePeriods!
      .map((sp) => {
        const date = formatDate(sp.start);
        const time = formatTime(sp.start);
        return `${date}${time ? ` · ${time}` : ''}`;
      })
      .join(' / ');
    prestationDateLine = `Prestations : ${dateLines}`;
  } else if (serviceStart) {
    prestationDateLine = `Prestation du : ${serviceStart}${serviceStartTime ? ` · ${serviceStartTime}` : ''}`;
  }

  // Logo HTML
  const logoHtml = vendor.logoUrl
    ? `<img src="${vendor.logoUrl}" style="max-height:48px;width:auto;object-fit:contain;" alt="Logo">`
    : `<div style="width:42px;height:42px;border-radius:10px;background:#004795;display:grid;place-items:center;color:#fff;font-weight:900;font-size:14px;letter-spacing:1px;">${brandInitials}</div>`;

  // Payment info
  const paymentMethod = payload.paymentTerms?.paymentMethod || payload.paymentMethod || 'Virement bancaire';

  // Notes
  const notesContent = payload.notes
    ? escapeHtml(payload.notes).replace(/\n/g, '<br />')
    : '';

  // Line items rows
  const lineItemsHtml = payload.lineItems
    .map(
      (item) => `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;">
            <span style="font-weight:600;color:#1e293b;font-size:11px;">${escapeHtml(item.description).replace(/\n/g, '<br/>')}</span>
            ${item.taxRate ? `<br><span style="font-size:9px;color:#94a3b8;font-style:italic;">TVA ${item.taxRate}%</span>` : ''}
          </td>
          <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;text-align:center;font-size:11px;color:#475569;">${item.quantity}</td>
          <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;text-align:right;font-size:11px;color:#475569;">${formatCurrency(item.unitPrice, payload.currency)}</td>
          <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;text-align:right;font-size:11px;font-weight:700;color:#004795;">${formatCurrency(item.total, payload.currency)}</td>
        </tr>`,
    )
    .join('');

  // Totals rows
  const totalsHtml: string[] = [];
  totalsHtml.push(`
    <tr>
      <td style="padding:4px 0;font-size:10px;color:#64748b;font-weight:600;text-transform:uppercase;">Total HT</td>
      <td style="padding:4px 0;font-size:11px;color:#1e293b;text-align:right;font-weight:600;">${formatCurrency(payload.totals.subtotal, payload.currency)}</td>
    </tr>
  `);

  if (payload.totals.taxAmount > 0) {
    totalsHtml.push(`
      <tr>
        <td style="padding:4px 0;font-size:10px;color:#64748b;font-weight:600;text-transform:uppercase;">TVA (${taxRate}%)</td>
        <td style="padding:4px 0;font-size:11px;color:#1e293b;text-align:right;font-weight:600;">${formatCurrency(payload.totals.taxAmount, payload.currency)}</td>
      </tr>
    `);
  }

  if (payload.totals.depositApplied > 0) {
    totalsHtml.push(`
      <tr>
        <td style="padding:4px 0;font-size:10px;color:#64748b;font-weight:600;text-transform:uppercase;">Acompte versé</td>
        <td style="padding:4px 0;font-size:11px;color:#1e293b;text-align:right;font-weight:600;">-${formatCurrency(payload.totals.depositApplied, payload.currency)}</td>
      </tr>
    `);
    totalsHtml.push(`
      <tr>
        <td colspan="2" style="padding-top:6px;border-top:1px solid #e2e8f0;"></td>
      </tr>
      <tr>
        <td style="padding:2px 0;font-size:10px;color:#004795;font-weight:900;text-transform:uppercase;">Reste à payer</td>
        <td style="padding:2px 0;font-size:16px;color:#004795;text-align:right;font-weight:900;letter-spacing:-0.03em;">${formatCurrency(payload.totals.balanceDue, payload.currency)}</td>
      </tr>
    `);
  } else {
    totalsHtml.push(`
      <tr>
        <td colspan="2" style="padding-top:6px;border-top:1px solid #e2e8f0;"></td>
      </tr>
      <tr>
        <td style="padding:2px 0;font-size:10px;color:#004795;font-weight:900;text-transform:uppercase;">Total TTC</td>
        <td style="padding:2px 0;font-size:16px;color:#004795;text-align:right;font-weight:900;letter-spacing:-0.03em;">${formatCurrency(payload.totals.total, payload.currency)}</td>
      </tr>
    `);
  }

  return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${documentTitle} — ${escapeHtml(brandTitle)}</title>
  <style>
    @page { size: A4; margin: 10mm; }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      color: #0f172a;
      font-size: 11px;
      line-height: 1.4;
      -webkit-font-smoothing: antialiased;
    }
    @media print {
      body { background: white; }
    }
    table { width: 100%; border-collapse: collapse; }
  </style>
</head>
<body style="padding:8mm;">

  <div style="max-width:700px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">

    <!-- Header : Logo + Doc info -->
    <div style="padding:20px 28px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #f1f5f9;">
      <div style="display:flex;align-items:center;gap:14px;">
        ${logoHtml}
        <div>
          <p style="font-size:13px;font-weight:800;color:#0f172a;letter-spacing:0.02em;">${escapeHtml(brandTitle)}</p>
          ${vendor.contactName && vendor.contactName !== brandTitle ? `<p style="font-size:10px;color:#64748b;">${escapeHtml(vendor.contactName)}</p>` : ''}
        </div>
      </div>
      <div style="text-align:right;">
        <p style="font-size:14px;font-weight:800;color:#004795;letter-spacing:-0.02em;">${documentTitle} ${escapeHtml(payload.number || invoiceId)}</p>
        <p style="font-size:10px;color:#64748b;margin-top:2px;">Date : ${issueDate}</p>
        ${dueDate ? `<p style="font-size:10px;color:#64748b;">Échéance : ${dueDate}</p>` : ''}
      </div>
    </div>

    <!-- Émetteur / Client -->
    <div style="padding:16px 28px;display:flex;gap:28px;border-bottom:1px solid #f1f5f9;">
      <div style="flex:1;">
        <p style="font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:0.12em;color:#004795;margin-bottom:6px;">Émetteur</p>
        <p style="font-size:11px;font-weight:700;color:#0f172a;margin-bottom:2px;">${escapeHtml(vendor.displayName || brandTitle)}</p>
        ${vendorAddress ? `<p style="font-size:10px;color:#475569;">${escapeHtml(vendorAddress)}</p>` : ''}
        ${vendorPostalCity ? `<p style="font-size:10px;color:#475569;">${escapeHtml(vendorPostalCity)}</p>` : ''}
        ${vendor.siret ? `<p style="font-size:9px;color:#94a3b8;margin-top:4px;">SIRET : ${formatSiret(vendor.siret)}</p>` : ''}
        ${vendor.email ? `<p style="font-size:9px;color:#94a3b8;">${escapeHtml(vendor.email)}</p>` : ''}
        ${vendor.phone ? `<p style="font-size:9px;color:#94a3b8;">${escapeHtml(vendor.phone)}</p>` : ''}
      </div>
      <div style="flex:1;text-align:right;">
        <p style="font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:0.12em;color:#94a3b8;margin-bottom:6px;">Client</p>
        <p style="font-size:11px;font-weight:700;color:#0f172a;text-transform:uppercase;margin-bottom:2px;">${escapeHtml(client.displayName)}</p>
        ${clientAddress ? `<p style="font-size:10px;color:#475569;">${escapeHtml(clientAddress)}</p>` : ''}
        ${clientPostalCity ? `<p style="font-size:10px;color:#475569;">${escapeHtml(clientPostalCity)}</p>` : ''}
        ${client.email ? `<p style="font-size:10px;color:#475569;">${escapeHtml(client.email)}</p>` : ''}
        ${client.siret ? `<p style="font-size:9px;color:#94a3b8;margin-top:4px;">SIRET : ${formatSiret(client.siret)}</p>` : ''}
        ${prestationDateLine ? `<p style="font-size:10px;color:#004795;font-weight:600;font-style:italic;margin-top:4px;">${escapeHtml(prestationDateLine)}</p>` : ''}
      </div>
    </div>

    <!-- Table des prestations -->
    <div style="padding:12px 28px 4px;">
      <table>
        <thead>
          <tr style="border-bottom:2px solid #f1f5f9;">
            <th style="padding:6px 0;font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;color:#94a3b8;text-align:left;width:52%;">Désignation</th>
            <th style="padding:6px 0;font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;color:#94a3b8;text-align:center;width:12%;">Qté</th>
            <th style="padding:6px 0;font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;color:#94a3b8;text-align:right;width:18%;">PU HT</th>
            <th style="padding:6px 0;font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;color:#94a3b8;text-align:right;width:18%;">Total HT</th>
          </tr>
        </thead>
        <tbody>
          ${lineItemsHtml}
        </tbody>
      </table>
    </div>

    <!-- Totaux + Paiement -->
    <div style="padding:16px 28px;display:flex;gap:28px;align-items:flex-start;">
      <!-- Paiement -->
      <div style="flex:1;">
        <div style="background:#f8fafc;padding:12px 14px;border-radius:8px;border:1px solid #f1f5f9;">
          <p style="font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;color:#004795;margin-bottom:6px;">Paiement</p>
          ${vendor.iban ? `<p style="font-size:9px;color:#475569;">IBAN : ${escapeHtml(vendor.iban)}</p>` : ''}
          <p style="font-size:9px;color:#0f172a;font-weight:700;${vendor.iban ? 'margin-top:4px;' : ''}">Mode : ${escapeHtml(paymentMethod)}</p>
          <p style="font-size:9px;color:#0f172a;font-weight:700;">Échéance : ${dueDate || 'À réception'}</p>
        </div>
        ${notesContent ? `
        <div style="margin-top:8px;padding:8px 14px;border-radius:8px;border:1px dashed #cbd5e1;font-size:9px;color:#64748b;line-height:1.5;">
          ${notesContent}
        </div>
        ` : ''}
      </div>
      <!-- Totaux -->
      <div style="width:200px;">
        <table>
          ${totalsHtml.join('')}
        </table>
      </div>
    </div>

    <!-- Footer -->
    <div style="padding:10px 28px;text-align:center;border-top:1px solid #f1f5f9;">
      <p style="font-size:8px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;line-height:1.8;">
        ${escapeHtml(vendor.displayName || brandTitle)}${vendor.siret ? ` · SIRET ${formatSiret(vendor.siret)}` : ''}${vendor.codeAPE ? ` · APE ${escapeHtml(vendor.codeAPE)}` : ''}
        <br>
        ${isVatExempt ? 'TVA non applicable, art. 293 B du CGI.' : `TVA ${taxRate}% incluse.`}
        ${payload.totals.depositApplied > 0 ? ` · Acompte de ${formatCurrency(payload.totals.depositApplied, payload.currency)} déduit.` : ''}
      </p>
    </div>
  </div>

</body>
</html>
`;
};
