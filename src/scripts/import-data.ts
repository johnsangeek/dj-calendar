import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, writeBatch, doc, query, where } from 'firebase/firestore';
import * as fs from 'fs';
import * as path from 'path';

// Configuration Firebase (même que dans votre app)
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Couleurs pour les clients
const colors = ['#3B82F6', '#8B5CF6', '#EC4899', '#EF4444', '#F97316', '#EAB308', '#10B981', '#14B8A6', '#6366F1', '#6B7280'];

// Parser une date DD/MM/YYYY
function parseDate(dateStr: string): Date {
  if (!dateStr || dateStr === ',,') return new Date();
  const parts = dateStr.split('/');
  if (parts.length !== 3) return new Date();
  return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
}

// Parser CSV
function parseCSV(content: string): any[] {
  const lines = content.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim());
  const data: any[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const values: string[] = [];
    let currentValue = '';
    let insideQuotes = false;

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

    const obj: any = {};
    headers.forEach((header, index) => {
      obj[header] = values[index] || '';
    });
    data.push(obj);
  }

  return data;
}

// Calculer la segmentation
function calculateSegmentation(stats: any) {
  const { totalPrestations, totalRevenue, daysInactive } = stats;

  const isVIP =
    totalPrestations >= 10 ||
    totalRevenue >= 5000 ||
    (totalPrestations >= 5 && daysInactive < 90);

  let lifecycle: 'actif' | 'en_veille' | 'a_relancer' = 'actif';
  if (daysInactive > 365) {
    lifecycle = 'a_relancer';
  } else if (daysInactive > 90) {
    lifecycle = 'en_veille';
  }

  return { vip: isVIP, lifecycle };
}

async function importClients() {
  console.log('📥 Import des clients...');

  const csvPath = '/Users/johnsanti/Downloads/Sauvegarde FDF 2026-01-14-00h46/clients_dj_clean.csv';
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const csvData = parseCSV(csvContent);

  // Vérifier les clients existants
  const existingClientsSnap = await getDocs(collection(db, 'clients'));
  const existingNames = new Set(existingClientsSnap.docs.map(doc => doc.data().name));

  console.log(`Clients existants dans la base: ${existingNames.size}`);

  const batch = writeBatch(db);
  let imported = 0;
  let skipped = 0;

  for (let i = 0; i < csvData.length; i++) {
    const row = csvData[i];
    const clientName = row.nom?.trim();

    if (!clientName) continue;

    if (existingNames.has(clientName)) {
      console.log(`⏭️  Client déjà existant: ${clientName}`);
      skipped++;
      continue;
    }

    const stats = {
      firstCollaborationAt: parseDate(row.premiere_facture),
      lastCollaborationAt: parseDate(row.derniere_facture),
      totalPrestations: parseInt(row.nombre_prestations) || 0,
      totalRevenue: parseFloat(row.total_facture_ttc) || 0,
      averageAmount: parseFloat(row.montant_moyen_prestation) || 0,
      minAmount: 0,
      maxAmount: 0,
      daysInactive: parseFloat(row.jours_depuis_derniere_facture) || 0
    };

    const segmentation = calculateSegmentation(stats);

    const clientRef = doc(collection(db, 'clients'));
    batch.set(clientRef, {
      name: clientName,
      address: row.adresse || undefined,
      color: colors[i % colors.length],
      stats,
      segmentation,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    console.log(`✅ Client ajouté: ${clientName} (${segmentation.vip ? 'VIP' : 'Standard'}, ${segmentation.lifecycle})`);
    imported++;

    // Commit par batch de 500
    if (imported % 500 === 0) {
      await batch.commit();
      console.log(`💾 Batch de ${imported} clients committé`);
    }
  }

  if (imported % 500 !== 0) {
    await batch.commit();
  }

  console.log(`\n✅ Import clients terminé: ${imported} ajoutés, ${skipped} déjà existants\n`);
  return imported;
}

async function importPrestations() {
  console.log('📥 Import des prestations...');

  const csvPath = '/Users/johnsanti/Downloads/Sauvegarde FDF 2026-01-14-00h46/prestations_dj_clean.csv';
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const csvData = parseCSV(csvContent);

  // Charger tous les clients pour le mapping
  const clientsSnapshot = await getDocs(collection(db, 'clients'));
  const clientsMap = new Map<string, string>();
  clientsSnapshot.forEach(doc => {
    const client = doc.data();
    clientsMap.set(client.name, doc.id);
  });

  console.log(`Clients trouvés: ${clientsMap.size}`);

  // Vérifier les prestations existantes (par client + date + montant)
  const existingPrestationsSnap = await getDocs(collection(db, 'prestations'));
  const existingKeys = new Set(
    existingPrestationsSnap.docs.map(doc => {
      const p = doc.data();
      const date = p.date?.toDate?.() || new Date(p.date);
      return `${p.clientId}_${date.toISOString()}_${p.amount}`;
    })
  );

  console.log(`Prestations existantes dans la base: ${existingKeys.size}`);

  const batch = writeBatch(db);
  let imported = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of csvData) {
    const clientName = row.client?.trim();
    const dateStr = row.date?.trim();
    const amount = parseFloat(row.montant) || 0;

    if (!clientName || !dateStr) continue;

    const clientId = clientsMap.get(clientName);
    if (!clientId) {
      console.log(`⚠️  Client introuvable: ${clientName}`);
      errors++;
      continue;
    }

    const prestationDate = parseDate(dateStr);
    const key = `${clientId}_${prestationDate.toISOString()}_${amount}`;

    if (existingKeys.has(key)) {
      skipped++;
      continue;
    }

    const prestationRef = doc(collection(db, 'prestations'));
    batch.set(prestationRef, {
      clientId,
      clientName,
      invoiceNumber: row.facture || undefined,
      date: prestationDate,
      reference: row.ref || undefined,
      description: row.description || undefined,
      amount,
      source: 'csv',
      createdAt: new Date(),
      updatedAt: new Date()
    });

    imported++;

    // Commit par batch de 500
    if (imported % 500 === 0) {
      await batch.commit();
      console.log(`💾 Batch de ${imported} prestations committé`);
    }
  }

  if (imported % 500 !== 0) {
    await batch.commit();
  }

  console.log(`\n✅ Import prestations terminé: ${imported} ajoutées, ${skipped} déjà existantes, ${errors} erreurs\n`);
  return imported;
}

async function updateClientMinMaxAmounts() {
  console.log('🔄 Mise à jour des montants min/max des clients...');

  const prestationsSnapshot = await getDocs(collection(db, 'prestations'));
  const clientAmounts = new Map<string, number[]>();

  prestationsSnapshot.forEach(doc => {
    const prestation = doc.data();
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
    if (count % 500 === 0) {
      await batch.commit();
    }
  }

  if (count % 500 !== 0) {
    await batch.commit();
  }

  console.log(`✅ ${count} clients mis à jour avec min/max\n`);
}

async function main() {
  console.log('🚀 Début de l\'import des données\n');
  console.log('='.repeat(50));

  try {
    // Import clients
    const clientsImported = await importClients();

    // Import prestations
    const prestationsImported = await importPrestations();

    // Mise à jour des montants min/max
    await updateClientMinMaxAmounts();

    console.log('='.repeat(50));
    console.log('\n🎉 Import terminé avec succès!');
    console.log(`📊 Résumé:`);
    console.log(`   - ${clientsImported} clients importés`);
    console.log(`   - ${prestationsImported} prestations importées`);
    console.log('\n✅ Votre CRM est maintenant prêt à l\'emploi!\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur lors de l\'import:', error);
    process.exit(1);
  }
}

main();
