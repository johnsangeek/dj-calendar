'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where, addDoc } from 'firebase/firestore';
import { Client, Booking, Invoice } from '@/types';
import { FileText, Download, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import jsPDF from 'jspdf';

export default function InvoicesPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    bookingId: '',
    type: 'devis' as 'devis' | 'facture',
    includeDeposit: false
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [clientsSnap, bookingsSnap, invoicesSnap] = await Promise.all([
      getDocs(collection(db, 'clients')),
      getDocs(collection(db, 'bookings')),
      getDocs(collection(db, 'invoices'))
    ]);

    setClients(clientsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Client)));
    setBookings(bookingsSnap.docs.map(doc => ({ 
      id: doc.id, 
      ...doc.data(),
      start: doc.data().start?.toDate(),
      end: doc.data().end?.toDate()
    } as Booking)));
    setInvoices(invoicesSnap.docs.map(doc => ({ 
      id: doc.id, 
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate()
    } as Invoice)));
  };

  const generatePDF = async (booking: Booking, type: 'devis' | 'facture', includeDeposit: boolean) => {
    const doc = new jsPDF();
    const client = clients.find(c => c.id === booking.clientId);
    
    // En-tête
    doc.setFontSize(20);
    doc.text(type === 'devis' ? 'DEVIS' : 'FACTURE', 20, 20);
    
    doc.setFontSize(10);
    doc.text(`Date: ${new Date().toLocaleDateString('fr-FR')}`, 20, 30);
    
    // Info DJ (à récupérer depuis settings)
    doc.text('DJ PRO', 20, 40);
    doc.text('Auto-entrepreneur', 20, 45);
    
    // Info Client - utiliser le nom professionnel pour les factures
    if (client) {
      const invoiceClientName = client.professionalName || client.name;
      doc.text(`Client: ${invoiceClientName}`, 20, 60);
      if (client.address) doc.text(client.address, 20, 65);
      if (client.siret) doc.text(`SIRET: ${client.siret}`, 20, 70);
    }
    
    // Prestation
    doc.text('Prestation:', 20, 85);
    doc.text(booking.title, 20, 90);
    doc.text(`Date: ${booking.start.toLocaleDateString('fr-FR')}`, 20, 95);
    doc.text(`${booking.start.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} - ${booking.end.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`, 20, 100);
    
    // Montants
    let y = 115;
    doc.text('Détail:', 20, y);
    y += 5;
    doc.text(`Prestation DJ: ${booking.price}€`, 20, y);
    
    if (includeDeposit && booking.deposit > 0) {
      y += 5;
      doc.text(`Acompte versé: -${booking.deposit}€`, 20, y);
      y += 5;
      doc.text(`Reste à payer: ${booking.price - booking.deposit}€`, 20, y);
    }
    
    y += 10;
    doc.setFontSize(12);
    doc.text(`Total: ${includeDeposit ? booking.price - booking.deposit : booking.price}€`, 20, y);
    
    // Sauvegarde
    const filename = `${type}_${booking.title.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.pdf`;
    doc.save(filename);
    
    // Enregistrer dans Firebase
    await addDoc(collection(db, 'invoices'), {
      bookingId: booking.id,
      clientId: booking.clientId,
      type,
      amount: includeDeposit ? booking.price - booking.deposit : booking.price,
      createdAt: new Date(),
      filename
    });
    
    loadData();
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    const booking = bookings.find(b => b.id === formData.bookingId);
    if (booking) {
      await generatePDF(booking, formData.type, formData.includeDeposit);
      setShowForm(false);
      setFormData({ bookingId: '', type: 'devis', includeDeposit: false });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-3">
            <Link href="/" className="p-2 hover:bg-gray-200 rounded-lg transition-colors" title="Retour au tableau de bord">
              <ArrowLeft className="w-6 h-6 text-gray-700" />
            </Link>
            <h1 className="text-3xl font-bold text-gray-900">💰 Factures</h1>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
          >
            {showForm ? 'Annuler' : 'Générer un document'}
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleGenerate} className="bg-white rounded-lg shadow-md p-6 mb-8">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Type de document</label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value as 'devis' | 'facture' })}
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
                  onChange={(e) => setFormData({ ...formData, bookingId: e.target.value })}
                  required
                  className="border rounded-lg px-4 py-2 w-full text-gray-900"
                >
                  <option value="">Sélectionner une prestation</option>
                  {bookings.filter(b => b.status === 'confirmé' || b.status === 'terminé').map(booking => (
                    <option key={booking.id} value={booking.id}>
                      {booking.title} - {booking.start.toLocaleDateString('fr-FR')} - {booking.price}€
                    </option>
                  ))}
                </select>
              </div>
              
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.includeDeposit}
                  onChange={(e) => setFormData({ ...formData, includeDeposit: e.target.checked })}
                  id="includeDeposit"
                />
                <label htmlFor="includeDeposit">Déduire l'acompte</label>
              </div>
              
              <button
                type="submit"
                className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
              >
                <FileText size={20} />
                Générer le PDF
              </button>
            </div>
          </form>
        )}

        <div className="bg-white rounded-lg shadow-md">
          <div className="p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Historique</h2>
            <div className="space-y-4">
              {invoices.map((invoice) => {
                const booking = bookings.find(b => b.id === invoice.bookingId);
                const client = clients.find(c => c.id === invoice.clientId);
                
                return (
                  <div key={invoice.id} className="border rounded-lg p-4 flex justify-between items-center">
                    <div>
                      <p className="font-semibold">
                        {invoice.type === 'devis' ? '📄 Devis' : '💰 Facture'} - {client?.name}
                      </p>
                      <p className="text-sm text-gray-800">{booking?.title}</p>
                      <p className="text-sm text-gray-800">
                        {invoice.createdAt.toLocaleDateString('fr-FR')} - {invoice.amount}€
                      </p>
                    </div>
                    <button className="text-blue-600 hover:text-blue-800">
                      <Download size={20} />
                    </button>
                  </div>
                );
              })}
              
              {invoices.length === 0 && (
                <div className="text-center py-8 text-gray-700">
                  Aucune facture générée
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
