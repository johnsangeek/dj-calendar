'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { db } from '@/lib/firebase';
import { doc, writeBatch } from 'firebase/firestore';
import { Client } from '@/types';
import { clientDocIdFromName, parseCsv, parseFrenchDate } from '@/lib/csv';
import { computeClientStats, computeSegmentation, PrestationInput } from '@/lib/client-segmentation';

type ImportStatus = 'idle' | 'parsing' | 'importing' | 'done' | 'error';

function cleanAddress(value: string | undefined): string | undefined {
  const v = value?.trim();
  if (!v) return undefined;
  const cleaned = v.replace(/^[,\s]+|[,\s]+$/g, '').trim();
  if (!cleaned || cleaned === ',,') return undefined;
  return cleaned;
}

function safeNumber(value: string | undefined): number {
  const v = value?.trim();
  if (!v) return 0;
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

export default function ClientsImportPage() {
  const [clientsFile, setClientsFile] = useState<File | null>(null);
  const [prestationsFile, setPrestationsFile] = useState<File | null>(null);
  const [status, setStatus] = useState<ImportStatus>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<{
    clientsUpserted: number;
    prestationsUpserted: number;
    clientsSegmented: number;
  } | null>(null);

  const canImport = useMemo(() => !!clientsFile && !!prestationsFile && status !== 'importing', [clientsFile, prestationsFile, status]);

  const readFileText = async (file: File): Promise<string> => {
    return await file.text();
  };

  const handleImport = async () => {
    if (!clientsFile || !prestationsFile) return;

    setStatus('parsing');
    setMessage(null);
    setResult(null);

    try {
      const [clientsText, prestationsText] = await Promise.all([
        readFileText(clientsFile),
        readFileText(prestationsFile),
      ]);

      const clientsRows = parseCsv(clientsText);
      const prestationsRows = parseCsv(prestationsText);

      if (clientsRows.length < 2) throw new Error('CSV clients: contenu insuffisant');
      if (prestationsRows.length < 2) throw new Error('CSV prestations: contenu insuffisant');

      const clientsHeader = clientsRows[0].map((h) => h.trim());
      const prestationsHeader = prestationsRows[0].map((h) => h.trim());

      const col = (header: string[], name: string) => {
        const idx = header.findIndex((h) => h.toLowerCase() === name.toLowerCase());
        if (idx < 0) throw new Error(`Colonne manquante: ${name}`);
        return idx;
      };

      const cNom = col(clientsHeader, 'nom');
      const cAdresse = col(clientsHeader, 'adresse');
      const cPremiere = col(clientsHeader, 'premiere_facture');
      const cDerniere = col(clientsHeader, 'derniere_facture');
      const cNbPrest = col(clientsHeader, 'nombre_prestations');
      const cTotal = col(clientsHeader, 'total_facture_ttc');
      const cMoy = col(clientsHeader, 'montant_moyen_prestation');

      const pClient = col(prestationsHeader, 'client');
      const pAdresse = col(prestationsHeader, 'adresse');
      const pFacture = col(prestationsHeader, 'facture');
      const pDate = col(prestationsHeader, 'date');
      const pRef = col(prestationsHeader, 'ref');
      const pDesc = col(prestationsHeader, 'description');
      const pMontant = col(prestationsHeader, 'montant');

      const now = new Date();

      const clientsById = new Map<string, Partial<Client> & { id: string }>();
      for (const row of clientsRows.slice(1)) {
        const name = (row[cNom] || '').trim();
        if (!name) continue;
        const id = clientDocIdFromName(name);

        const first = parseFrenchDate(row[cPremiere]);
        const last = parseFrenchDate(row[cDerniere]);

        const totalPrestations = safeNumber(row[cNbPrest]);
        const totalRevenue = safeNumber(row[cTotal]);
        const avg = safeNumber(row[cMoy]);

        clientsById.set(id, {
          id,
          name,
          address: cleanAddress(row[cAdresse]),
          createdAt: now,
          updatedAt: now,
          stats: {
            firstCollaborationAt: first || undefined,
            lastCollaborationAt: last || undefined,
            totalPrestations: Math.floor(totalPrestations),
            totalRevenue,
            averageAmount: avg,
            minAmount: 0,
            maxAmount: 0,
            daysInactive: last ? Math.floor((now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24)) : Number.POSITIVE_INFINITY,
          },
          segmentation: undefined,
        });
      }

      const prestationsByClient = new Map<string, PrestationInput[]>();
      const prestationsDocs: Array<{ id: string; data: any }> = [];

      for (const row of prestationsRows.slice(1)) {
        const clientName = (row[pClient] || '').trim();
        if (!clientName) continue;
        const clientId = clientDocIdFromName(clientName);

        if (!clientsById.has(clientId)) {
          clientsById.set(clientId, {
            id: clientId,
            name: clientName,
            address: cleanAddress(row[pAdresse]),
            createdAt: now,
            updatedAt: now,
          });
        }

        const date = parseFrenchDate(row[pDate]);
        if (!date) continue;

        const invoiceNumber = (row[pFacture] || '').trim() || undefined;
        const reference = (row[pRef] || '').trim() || undefined;
        const description = (row[pDesc] || '').trim() || undefined;
        const amount = safeNumber(row[pMontant]);

        const key = `${clientId}|${invoiceNumber || ''}|${date.toISOString().slice(0, 10)}|${amount}|${reference || ''}|${description || ''}`;
        const prestationId = `p_${clientIdFromNameForPrestationId(clientName)}_${hashForPrestation(key)}`;

        const prestationData = {
          clientId,
          clientName,
          invoiceNumber,
          date,
          reference,
          description,
          amount,
          source: 'csv',
          createdAt: now,
          updatedAt: now,
        };

        prestationsDocs.push({ id: prestationId, data: prestationData });

        const list = prestationsByClient.get(clientId) || [];
        list.push({ clientId, clientName, invoiceNumber, date, amount });
        prestationsByClient.set(clientId, list);
      }

      setStatus('importing');

      let batch = writeBatch(db);
      let ops = 0;
      let clientsUpserted = 0;
      let prestationsUpserted = 0;
      let clientsSegmented = 0;

      const commitAndReset = async () => {
        await batch.commit();
        batch = writeBatch(db);
        ops = 0;
      };

      const commitIfNeeded = async () => {
        if (ops >= 450) {
          await commitAndReset();
        }
      };

      for (const client of clientsById.values()) {
        const prestations = prestationsByClient.get(client.id) || [];
        if (prestations.length > 0) {
          const stats = computeClientStats(prestations, now);
          const segmentation = computeSegmentation(stats);
          client.stats = stats as any;
          client.segmentation = segmentation as any;
          clientsSegmented++;
        } else {
          client.stats = client.stats || {
            totalPrestations: 0,
            totalRevenue: 0,
            averageAmount: 0,
            minAmount: 0,
            maxAmount: 0,
            daysInactive: Number.POSITIVE_INFINITY,
          } as any;
          client.segmentation = client.segmentation || ({ vip: false, lifecycle: 'a_relancer' } as any);
        }

        const clientRef = doc(db, 'clients', client.id);
        batch.set(clientRef, { ...client, updatedAt: now }, { merge: true });
        ops++;
        clientsUpserted++;
        await commitIfNeeded();
      }

      for (const p of prestationsDocs) {
        const ref = doc(db, 'prestations', p.id);
        batch.set(ref, p.data, { merge: true });
        ops++;
        prestationsUpserted++;
        await commitIfNeeded();
      }

      if (ops > 0) {
        await commitAndReset();
      }

      setResult({ clientsUpserted, prestationsUpserted, clientsSegmented });
      setStatus('done');
      setMessage('Import terminé.');
    } catch (e) {
      console.error(e);
      setStatus('error');
      setMessage(e instanceof Error ? e.message : 'Erreur inconnue');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-4">
              <Link href="/crm" className="p-2 hover:bg-gray-100 rounded-lg transition-colors" title="Retour au CRM">
                <ArrowLeft className="w-5 h-5 text-gray-700" />
              </Link>
              <span className="text-gray-900 font-semibold">Import CSV Clients + Prestations</span>
            </div>
            <Link href="/" className="text-gray-600 hover:text-gray-900">Dashboard</Link>
          </div>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Importer CSV Clients + Prestations</h1>
        <p className="text-gray-600 mb-6">Sélectionne les 2 fichiers, puis lance l’import. Ré-importer ne crée pas de doublons.</p>

        {message && (
          <div className={`mb-6 p-4 rounded-lg ${status === 'error' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
            {message}
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">clients_dj_clean.csv</label>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => setClientsFile(e.target.files?.[0] || null)}
              className="block w-full text-sm text-gray-700"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">prestations_dj_clean.csv</label>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => setPrestationsFile(e.target.files?.[0] || null)}
              className="block w-full text-sm text-gray-700"
            />
          </div>

          <button
            onClick={handleImport}
            disabled={!canImport}
            className={`w-full px-4 py-2 rounded-lg text-white ${canImport ? 'bg-purple-600 hover:bg-purple-700' : 'bg-gray-400 cursor-not-allowed'}`}
          >
            {status === 'parsing' ? 'Analyse des CSV…' : status === 'importing' ? 'Import en cours…' : 'Importer dans Firestore'}
          </button>

          {result && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-lg bg-gray-50 border">
                <div className="text-sm text-gray-600">Clients upsert</div>
                <div className="text-2xl font-bold text-gray-900">{result.clientsUpserted}</div>
              </div>
              <div className="p-4 rounded-lg bg-gray-50 border">
                <div className="text-sm text-gray-600">Prestations upsert</div>
                <div className="text-2xl font-bold text-gray-900">{result.prestationsUpserted}</div>
              </div>
              <div className="p-4 rounded-lg bg-gray-50 border">
                <div className="text-sm text-gray-600">Clients segmentés</div>
                <div className="text-2xl font-bold text-gray-900">{result.clientsSegmented}</div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function hashForPrestation(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function clientIdFromNameForPrestationId(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24) || 'client';
}
