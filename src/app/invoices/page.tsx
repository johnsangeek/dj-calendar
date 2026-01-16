'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { ArrowLeft, Download, FileText, Save } from 'lucide-react';
import { addDoc, collection, doc, getDoc, getDocs, updateDoc } from 'firebase/firestore';

import { db } from '@/lib/firebase';
import {
  Booking,
  Client,
  DJInfo,
  Invoice,
  InvoiceDocumentType,
  InvoiceStatus,
} from '@/types';
import { buildInvoicePayload, InvoiceWritePayload } from '@/lib/invoices';
import { generateInvoiceHtml } from '@/lib/invoice-template';

if (typeof window !== 'undefined') {
  // jsPDF requires html2canvas to be available on the window object for HTML rendering.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).html2canvas = html2canvas;
}

const toDate = (value: any): Date | undefined => {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  return new Date(value);
};

const statusStyles: Record<InvoiceStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-800',
  ISSUED: 'bg-blue-100 text-blue-800',
  PAID: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
  CREDITED: 'bg-orange-100 text-orange-700',
};

const statusLabels: Record<InvoiceStatus, string> = {
  DRAFT: 'Brouillon',
  ISSUED: 'Émise',
  PAID: 'Payée',
  CANCELLED: 'Annulée',
  CREDITED: 'Créditée',
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value || 0);

const documentTypeLabel = (type: InvoiceDocumentType) => {
  switch (type) {
    case 'QUOTE':
      return '📄 Devis';
    case 'CREDIT_NOTE':
      return '🔁 Avoir';
    default:
      return '💰 Facture';
  }
};

export default function InvoicesPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [vendorInfo, setVendorInfo] = useState<DJInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [formData, setFormData] = useState({
    bookingId: '',
    type: 'devis' as 'devis' | 'facture',
    includeDeposit: false,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [clientsSnap, bookingsSnap, invoicesSnap, vendorSnap] = await Promise.all([
        getDocs(collection(db, 'clients')),
        getDocs(collection(db, 'bookings')),
        getDocs(collection(db, 'invoices')),
        getDoc(doc(db, 'settings', 'dj_info')),
      ]);

      const vendorData = vendorSnap.exists() ? (vendorSnap.data() as DJInfo) : null;
      setVendorInfo(vendorData);

      setClients(
        clientsSnap.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        })) as Client[],
      );

      setBookings(
        bookingsSnap.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
          start: toDate(docSnap.data().start)!,
          end: toDate(docSnap.data().end)!,
        })) as Booking[],
      );

      const invoicesData = invoicesSnap.docs.map((docSnap) => {
        const data = docSnap.data();
        const totals = data.totals ?? {
          currency: 'EUR',
          subtotal: data.amountNet ?? data.amount ?? 0,
          taxRate: data.taxRate,
          taxAmount: data.amountTax ?? 0,
          total: data.amountGross ?? data.amount ?? 0,
          depositApplied: data.depositApplied ?? 0,
          balanceDue: data.balanceDue ?? data.amountGross ?? data.amount ?? 0,
        };

        const status: InvoiceStatus = data.status
          ? (['DRAFT', 'ISSUED', 'PAID', 'CANCELLED', 'CREDITED'].includes(data.status)
              ? data.status
              : data.status === 'paid'
                ? 'PAID'
                : data.status === 'cancelled'
                  ? 'CANCELLED'
                  : 'ISSUED')
          : 'DRAFT';

        const documentType: InvoiceDocumentType = data.documentType
          ? data.documentType
          : data.type === 'devis'
            ? 'QUOTE'
            : data.type === 'facture'
              ? 'INVOICE'
              : 'INVOICE';

        const vendorSnapshot = data.vendorSnapshot ?? {
          displayName:
            vendorData?.commercialName || vendorData?.stageName || vendorData?.name || 'DJ Booker Pro',
          contactName: vendorData?.name,
          email: vendorData?.email,
          phone: vendorData?.phone,
          address: vendorData?.address,
          siret: vendorData?.siret,
          vatNumber: vendorData?.vatNumber,
          stageName: vendorData?.stageName,
          taxRate: vendorData?.taxRate,
        };

        const clientSnapshot = data.clientSnapshot ?? {
          displayName: data.clientName || 'Client',
          contactName: data.clientName,
          email: data.clientEmail,
          phone: data.clientPhone,
          address: data.clientAddress,
          siret: data.clientSiret,
        };

        const lineItems = Array.isArray(data.lineItems) && data.lineItems.length > 0
          ? data.lineItems
          : [
              {
                id: 'legacy-service',
                description: data.notes || 'Prestation DJ',
                quantity: 1,
                unitPrice: totals.total,
                total: totals.total,
                taxRate: data.taxRate,
                taxAmount: data.amountTax,
              },
            ];

        return {
          id: docSnap.id,
          number: data.number,
          documentType,
          status,
          bookingId: data.bookingId,
          clientId: data.clientId,
          vendorSnapshot,
          clientSnapshot,
          lineItems,
          totals,
          currency: totals.currency || 'EUR',
          servicePeriod: data.servicePeriod
            ? {
                start: toDate(data.servicePeriod.start)!,
                end: toDate(data.servicePeriod.end)!,
              }
            : undefined,
          issueDate: toDate(data.issueDate),
          dueDate: toDate(data.dueDate),
          paymentTerms: data.paymentTerms
            ? {
                ...data.paymentTerms,
                dueDate: toDate(data.paymentTerms.dueDate),
              }
            : undefined,
          paymentMethod: data.paymentMethod,
          issuedBy: data.issuedBy,
          paidAt: toDate(data.paidAt),
          cancelledAt: toDate(data.cancelledAt),
          creditedInvoiceId: data.creditedInvoiceId,
          notes: data.notes,
          hash: data.hash,
          pdfStoragePath: data.pdfStoragePath || data.filename,
          createdAt: toDate(data.createdAt) || new Date(),
          updatedAt: toDate(data.updatedAt) || new Date(),
          source: data.source,
          legacyInvoiceNumber: data.invoiceNumber,
        } as Invoice;
      });

      setInvoices(invoicesData);
    } catch (error) {
      console.error('Erreur chargement factures:', error);
    } finally {
      setLoading(false);
    }
  };

  const selectedBooking = useMemo(
    () => bookings.find((booking) => booking.id === formData.bookingId),
    [bookings, formData.bookingId],
  );

  const selectedClient = useMemo(() => {
    if (!selectedBooking?.clientId) return undefined;
    return clients.find((client) => client.id === selectedBooking.clientId);
  }, [clients, selectedBooking?.clientId]);

  const handleSaveDraft = async () => {
    if (!selectedBooking) return;
    setSavingDraft(true);
    try {
      const payload = buildInvoicePayload({
        booking: selectedBooking,
        client: selectedClient,
        vendor: vendorInfo,
        documentType: formData.type === 'facture' ? 'INVOICE' : 'QUOTE',
        status: 'DRAFT',
        includeDeposit: formData.includeDeposit,
      });

      await addDoc(collection(db, 'invoices'), payload);
      await loadData();
      setShowForm(false);
      setFormData({ bookingId: '', type: 'devis', includeDeposit: false });
    } catch (error) {
      console.error('Erreur lors de la sauvegarde du brouillon:', error);
    } finally {
      setSavingDraft(false);
    }
  };

  const generatePDF = async (invoiceId: string, payload: InvoiceWritePayload) => {
    const html = generateInvoiceHtml(payload, { invoiceId });
    const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
    const filename = `${payload.documentType === 'QUOTE' ? 'devis' : 'facture'}_${invoiceId}.pdf`;

    await new Promise<void>((resolve) => {
      pdf.html(html, {
        margin: [32, 32, 32, 32],
        autoPaging: 'text',
        html2canvas: {
          scale: 0.8,
          letterRendering: true,
        },
        callback: (docInstance) => {
          docInstance.save(filename);
          resolve();
        },
      });
    });

    await updateDoc(doc(db, 'invoices', invoiceId), {
      pdfStoragePath: filename,
      updatedAt: new Date(),
    });
  };

  const handleGenerate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedBooking) return;
    setIssuing(true);
    try {
      const payload = buildInvoicePayload({
        booking: selectedBooking,
        client: selectedClient,
        vendor: vendorInfo,
        documentType: formData.type === 'facture' ? 'INVOICE' : 'QUOTE',
        status: 'ISSUED',
        includeDeposit: formData.includeDeposit,
      });

      const docRef = await addDoc(collection(db, 'invoices'), payload);
      await generatePDF(docRef.id, payload);
      await loadData();
      setShowForm(false);
      setFormData({ bookingId: '', type: 'devis', includeDeposit: false });
    } catch (error) {
      console.error('Erreur lors de l\'émission de la facture:', error);
    } finally {
      setIssuing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
              title="Retour au tableau de bord"
            >
              <ArrowLeft className="w-6 h-6 text-gray-700" />
            </Link>
            <h1 className="text-3xl font-bold text-gray-900">💰 Factures</h1>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
          >
            {showForm ? 'Fermer' : 'Créer un document'}
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleGenerate} className="bg-white rounded-lg shadow-md p-6 mb-8">
            <div className="space-y-4">
              {vendorInfo === null && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  Renseignez vos informations légales dans Paramètres &gt; Informations DJ avant d'émettre une facture.
                </p>
              )}

              <div>
                <label className="block text-sm font-medium mb-2">Type de document</label>
                <select
                  value={formData.type}
                  onChange={(event) =>
                    setFormData({ ...formData, type: event.target.value as 'devis' | 'facture' })
                  }
                  className="border rounded-lg px-4 py-2 w-full text-gray-900"
                >
                  <option value="devis">Devis</option>
                  <option value="facture">Facture</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Prestation</label>
                <select
                  value={formData.bookingId}
                  onChange={(event) => setFormData({ ...formData, bookingId: event.target.value })}
                  required
                  className="border rounded-lg px-4 py-2 w-full text-gray-900"
                >
                  <option value="">Sélectionner une prestation</option>
                  {bookings
                    .filter((booking) => booking.status === 'confirmé' || booking.status === 'terminé')
                    .map((booking) => (
                      <option key={booking.id} value={booking.id}>
                        {booking.title} · {booking.start.toLocaleDateString('fr-FR')} ·{' '}
                        {formatCurrency(booking.price)}
                      </option>
                    ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.includeDeposit}
                  onChange={(event) =>
                    setFormData({ ...formData, includeDeposit: event.target.checked })
                  }
                  id="includeDeposit"
                  className="rounded"
                />
                <label htmlFor="includeDeposit">Déduire l'acompte</label>
              </div>

              <div className="flex flex-wrap gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  disabled={!selectedBooking || savingDraft}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                >
                  <Save size={18} />
                  Sauvegarder en brouillon
                </button>
                <button
                  type="submit"
                  disabled={!selectedBooking || issuing}
                  className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-60"
                >
                  <FileText size={20} />
                  Générer le PDF
                </button>
              </div>
            </div>
          </form>
        )}

        <div className="bg-white rounded-lg shadow-md">
          <div className="p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Historique</h2>
            <div className="space-y-4">
              {invoices.map((invoice) => (
                <div key={invoice.id} className="border rounded-lg p-4 flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-3">
                      <p className="font-semibold text-gray-900">
                        {documentTypeLabel(invoice.documentType)} · {invoice.clientSnapshot.displayName}
                      </p>
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${statusStyles[invoice.status]}`}>
                        {statusLabels[invoice.status]}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 mt-1">
                      {invoice.servicePeriod?.start
                        ? invoice.servicePeriod.start.toLocaleDateString('fr-FR')
                        : invoice.issueDate?.toLocaleDateString('fr-FR')}
                      {invoice.totals?.total !== undefined &&
                        ` · ${formatCurrency(invoice.totals.total)}`}
                    </p>
                    {invoice.notes && (
                      <p className="text-xs text-gray-500 mt-1">{invoice.notes}</p>
                    )}
                  </div>
                  <button
                    className="text-blue-600 hover:text-blue-800"
                    title={invoice.pdfStoragePath ? 'Télécharger le PDF' : 'PDF indisponible'}
                    disabled={!invoice.pdfStoragePath}
                  >
                    <Download size={20} />
                  </button>
                </div>
              ))}

              {!loading && invoices.length === 0 && (
                <div className="text-center py-8 text-gray-700">Aucun document enregistré</div>
              )}

              {loading && (
                <div className="text-center py-8 text-gray-500">Chargement des factures…</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
