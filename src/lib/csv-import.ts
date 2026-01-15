import { Client, Prestation, ClientStats, ClientSegmentation } from '@/types';
import { collection, doc, writeBatch, getDocs, query, where } from 'firebase/firestore';
import { db } from './firebase';

interface CSVClient {
  nom: string;
  adresse: string;
  premiere_facture: string;
  derniere_facture: string;
  jours_depuis_derniere_facture: number;
  nombre_prestations: number;
  nombre_factures: number;
  total_facture_ttc: number;
  montant_moyen_prestation: number;
}

interface CSVPrestation {
  client: string;
  adresse: string;
  facture: string;
  date: string;
  ref: string;
  description: string;
  montant: number;
}

// Fonction pour parser une date au format DD/MM/YYYY
function parseDate(dateStr: string): Date {
  if (!dateStr || dateStr === ',,') return new Date();
  const parts = dateStr.split('/');
  if (parts.length !== 3) return new Date();
  // Format: DD/MM/YYYY -> new Date(year, month-1, day)
  return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
}

// Fonction de segmentation automatique des clients
export function calculateSegmentation(stats: ClientStats): ClientSegmentation {
  const { totalPrestations, totalRevenue, daysInactive } = stats;

  // Critères VIP
  const isVIP =
    totalPrestations >= 10 ||
    totalRevenue >= 5000 ||
    (totalPrestations >= 5 && daysInactive < 90);

  // Déterminer le lifecycle
  let lifecycle: 'actif' | 'en_veille' | 'a_relancer' = 'actif';

  if (daysInactive > 365) {
    lifecycle = 'a_relancer';
  } else if (daysInactive > 90) {
    lifecycle = 'en_veille';
  }

  return {
    vip: isVIP,
    lifecycle
  };
}

// Fonction pour parser un fichier CSV avec gestion avancée des guillemets
function parseCSV(content: string): any[] {
  const lines = content.trim().split('\n');
  if (lines.length < 2) return [];

  // Parser la ligne d'en-tête
  const headerLine = lines[0];
  const headers: string[] = [];
  let currentValue = '';
  let insideQuotes = false;

  for (let j = 0; j < headerLine.length; j++) {
    const char = headerLine[j];
    if (char === '"') {
      insideQuotes = !insideQuotes;
    } else if (char === ',' && !insideQuotes) {
      headers.push(currentValue.trim());
      currentValue = '';
    } else {
      currentValue += char;
    }
  }
  headers.push(currentValue.trim());

  const data: any[] = [];

  // Parser chaque ligne de données
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const values: string[] = [];
    currentValue = '';
    insideQuotes = false;

    for (let j = 0; j < line.length; j++) {
      const char = line[j];

      if (char === '"') {
        insideQuotes = !insideQuotes;
      } else if (char === ',' && !insideQuotes) {
        values.push(currentValue.trim());
        currentValue = '';
      } else {
        currentValue += char;
      }
    }
    values.push(currentValue.trim());

    // Créer l'objet avec les valeurs
    const obj: any = {};
    headers.forEach((header, index) => {
      obj[header] = values[index] || '';
    });
    data.push(obj);
  }

  return data;
}

// Import des clients depuis CSV
export async function importClientsFromCSV(csvContent: string): Promise<{ success: number; errors: string[] }> {
  const errors: string[] = [];
  let success = 0;

  try {
    const csvData = parseCSV(csvContent);
    const batch = writeBatch(db);
    const colors = ['#3B82F6', '#8B5CF6', '#EC4899', '#EF4444', '#F97316', '#EAB308', '#10B981', '#14B8A6', '#6366F1', '#6B7280'];

    for (const row of csvData) {
      try {
        const clientData: CSVClient = {
          nom: row.nom,
          adresse: row.adresse,
          premiere_facture: row.premiere_facture,
          derniere_facture: row.derniere_facture,
          jours_depuis_derniere_facture: parseFloat(row.jours_depuis_derniere_facture) || 0,
          nombre_prestations: parseInt(row.nombre_prestations) || 0,
          nombre_factures: parseInt(row.nombre_factures) || 0,
          total_facture_ttc: parseFloat(row.total_facture_ttc) || 0,
          montant_moyen_prestation: parseFloat(row.montant_moyen_prestation) || 0
        };

        if (!clientData.nom) continue;

        // Calculer les stats
        const stats: ClientStats = {
          firstCollaborationAt: parseDate(clientData.premiere_facture),
          lastCollaborationAt: parseDate(clientData.derniere_facture),
          totalPrestations: clientData.nombre_prestations,
          totalRevenue: clientData.total_facture_ttc,
          averageAmount: clientData.montant_moyen_prestation,
          minAmount: 0, // Sera calculé après import des prestations
          maxAmount: 0, // Sera calculé après import des prestations
          daysInactive: clientData.jours_depuis_derniere_facture
        };

        // Calculer la segmentation
        const segmentation = calculateSegmentation(stats);

        // Vérifier si le client existe déjà
        const existingClientQuery = query(
          collection(db, 'clients'),
          where('name', '==', clientData.nom)
        );
        const existingClients = await getDocs(existingClientQuery);

        const clientRef = existingClients.empty
          ? doc(collection(db, 'clients'))
          : existingClients.docs[0].ref;

        const client: any = {
          name: clientData.nom,
          color: colors[success % colors.length],
          stats,
          segmentation,
          createdAt: new Date(),
          updatedAt: new Date()
        };

        // Ajouter l'adresse seulement si elle existe
        if (clientData.adresse) client.address = clientData.adresse;

        batch.set(clientRef, client, { merge: true });
        success++;
      } catch (error) {
        errors.push(`Erreur pour client ${row.nom}: ${error}`);
      }
    }

    await batch.commit();
    return { success, errors };
  } catch (error) {
    errors.push(`Erreur générale: ${error}`);
    return { success, errors };
  }
}

// Import des prestations depuis CSV
export async function importPrestationsFromCSV(csvContent: string): Promise<{ success: number; errors: string[] }> {
  const errors: string[] = [];
  let success = 0;

  try {
    const csvData = parseCSV(csvContent);

    // Charger tous les clients pour le mapping
    const clientsSnapshot = await getDocs(collection(db, 'clients'));
    const clientsMap = new Map<string, string>();
    clientsSnapshot.forEach(doc => {
      const client = doc.data() as Client;
      clientsMap.set(client.name, doc.id);
    });

    const batch = writeBatch(db);
    let batchCount = 0;

    for (const row of csvData) {
      try {
        const prestationData: CSVPrestation = {
          client: row.client,
          adresse: row.adresse,
          facture: row.facture,
          date: row.date,
          ref: row.ref,
          description: row.description,
          montant: parseFloat(row.montant) || 0
        };

        if (!prestationData.client || !prestationData.date) continue;

        const clientId = clientsMap.get(prestationData.client);
        if (!clientId) {
          errors.push(`Client introuvable: ${prestationData.client}`);
          continue;
        }

        const prestationRef = doc(collection(db, 'prestations'));

        const prestation: any = {
          clientId,
          clientName: prestationData.client,
          date: parseDate(prestationData.date),
          amount: prestationData.montant,
          source: 'csv',
          createdAt: new Date(),
          updatedAt: new Date()
        };

        // Ajouter les champs optionnels seulement s'ils ont une valeur
        if (prestationData.facture) prestation.invoiceNumber = prestationData.facture;
        if (prestationData.ref) prestation.reference = prestationData.ref;
        if (prestationData.description) prestation.description = prestationData.description;

        batch.set(prestationRef, prestation);
        success++;
        batchCount++;

        // Firestore limite à 500 opérations par batch
        if (batchCount >= 500) {
          await batch.commit();
          batchCount = 0;
        }
      } catch (error) {
        errors.push(`Erreur pour prestation de ${row.client}: ${error}`);
      }
    }

    if (batchCount > 0) {
      await batch.commit();
    }

    // Mettre à jour les stats min/max des clients
    await updateClientMinMaxAmounts();

    return { success, errors };
  } catch (error) {
    errors.push(`Erreur générale: ${error}`);
    return { success, errors };
  }
}

// Mettre à jour les montants min/max des clients
async function updateClientMinMaxAmounts() {
  const prestationsSnapshot = await getDocs(collection(db, 'prestations'));
  const clientAmounts = new Map<string, number[]>();

  prestationsSnapshot.forEach(doc => {
    const prestation = doc.data() as Prestation;
    if (!clientAmounts.has(prestation.clientId)) {
      clientAmounts.set(prestation.clientId, []);
    }
    clientAmounts.get(prestation.clientId)!.push(prestation.amount);
  });

  const batch = writeBatch(db);
  let count = 0;

  for (const [clientId, amounts] of clientAmounts.entries()) {
    const clientRef = doc(db, 'clients', clientId);
    const minAmount = Math.min(...amounts);
    const maxAmount = Math.max(...amounts);

    batch.update(clientRef, {
      'stats.minAmount': minAmount,
      'stats.maxAmount': maxAmount,
      updatedAt: new Date()
    });

    count++;
    if (count >= 500) {
      await batch.commit();
      count = 0;
    }
  }

  if (count > 0) {
    await batch.commit();
  }
}

// Recalculer TOUTES les stats ET segmentations pour tous les clients
export async function recalculateAllSegmentations(): Promise<number> {
  console.log('🔄 Recalcul complet des stats et segmentations...');

  // Charger tous les clients
  const clientsSnapshot = await getDocs(collection(db, 'clients'));
  const clientIds = clientsSnapshot.docs.map(doc => doc.id);

  // Charger toutes les prestations
  const prestationsSnapshot = await getDocs(collection(db, 'prestations'));

  // Grouper les prestations par client
  const clientPrestations = new Map<string, Prestation[]>();

  prestationsSnapshot.forEach(doc => {
    const prestation = {
      id: doc.id,
      ...doc.data(),
      date: doc.data().date?.toDate() || new Date(),
      createdAt: doc.data().createdAt?.toDate() || new Date(),
      updatedAt: doc.data().updatedAt?.toDate() || new Date()
    } as Prestation;

    if (!clientPrestations.has(prestation.clientId)) {
      clientPrestations.set(prestation.clientId, []);
    }
    clientPrestations.get(prestation.clientId)!.push(prestation);
  });

  // Batch pour mise à jour
  const batch = writeBatch(db);
  let count = 0;

  for (const clientId of clientIds) {
    const prestations = clientPrestations.get(clientId) || [];

    if (prestations.length === 0) {
      // Client sans prestations
      const stats: ClientStats = {
        totalPrestations: 0,
        totalRevenue: 0,
        averageAmount: 0,
        minAmount: 0,
        maxAmount: 0,
        daysInactive: 999999
      };

      batch.update(doc(db, 'clients', clientId), {
        stats,
        segmentation: calculateSegmentation(stats),
        updatedAt: new Date()
      });
      count++;
      continue;
    }

    // Calculer les stats à partir des prestations
    const amounts = prestations.map(p => p.amount);
    const dates = prestations.map(p => p.date).sort((a, b) => b.getTime() - a.getTime());

    const totalRevenue = amounts.reduce((sum, amount) => sum + amount, 0);
    const stats: ClientStats = {
      firstCollaborationAt: dates[dates.length - 1],
      lastCollaborationAt: dates[0],
      totalPrestations: prestations.length,
      totalRevenue,
      averageAmount: Math.round(totalRevenue / prestations.length),
      minAmount: Math.min(...amounts),
      maxAmount: Math.max(...amounts),
      daysInactive: Math.floor((Date.now() - dates[0].getTime()) / (1000 * 60 * 60 * 24))
    };

    batch.update(doc(db, 'clients', clientId), {
      stats,
      segmentation: calculateSegmentation(stats),
      updatedAt: new Date()
    });
    count++;

    // Firestore limite à 500 opérations par batch
    if (count >= 500) {
      await batch.commit();
      count = 0;
    }
  }

  if (count > 0) {
    await batch.commit();
  }

  console.log(`✅ ${clientIds.length} clients recalculés`);
  return clientIds.length;
}
