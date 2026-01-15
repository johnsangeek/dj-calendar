import { collection, getDocs, deleteDoc, doc, updateDoc, query, where } from 'firebase/firestore';
import { db } from './firebase';
import { Prestation, Client } from '@/types';

interface DuplicateGroup {
  key: string;
  prestations: Prestation[];
}

/**
 * Détecte et supprime les prestations en double
 * Critères de doublon : même clientId + même clientName + même date + même montant
 */
export async function cleanDuplicatePrestations(): Promise<{ deleted: number; kept: number }> {
  console.log('🔍 Recherche de doublons...');

  // Charger toutes les prestations
  const prestationsSnap = await getDocs(collection(db, 'prestations'));
  const prestations: Prestation[] = prestationsSnap.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
    date: doc.data().date?.toDate() || new Date(),
    createdAt: doc.data().createdAt?.toDate() || new Date(),
    updatedAt: doc.data().updatedAt?.toDate() || new Date()
  })) as Prestation[];

  console.log(`📊 Total prestations: ${prestations.length}`);

  // Grouper par clé unique (clientId + clientName + date + montant)
  const groups = new Map<string, Prestation[]>();

  prestations.forEach(prestation => {
    const dateStr = prestation.date.toISOString().split('T')[0]; // YYYY-MM-DD
    const key = `${prestation.clientId}_${prestation.clientName}_${dateStr}_${prestation.amount}`;

    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(prestation);
  });

  // Identifier les groupes avec doublons
  const duplicateGroups: DuplicateGroup[] = [];
  groups.forEach((group, key) => {
    if (group.length > 1) {
      duplicateGroups.push({ key, prestations: group });
    }
  });

  console.log(`⚠️  Groupes de doublons trouvés: ${duplicateGroups.length}`);

  let deleted = 0;
  let kept = duplicateGroups.length;

  // Pour chaque groupe de doublons, garder le premier et supprimer les autres
  for (const group of duplicateGroups) {
    const [keep, ...toDelete] = group.prestations;

    console.log(`🔸 Doublon: ${keep.clientName} - ${keep.date.toLocaleDateString('fr-FR')} - ${keep.amount}€ (${group.prestations.length} occurrences)`);
    console.log(`   ✅ Garder: ${keep.id}`);

    for (const prestation of toDelete) {
      try {
        console.log(`   ❌ Supprimer: ${prestation.id}`);
        await deleteDoc(doc(db, 'prestations', prestation.id));
        deleted++;
      } catch (error) {
        console.error(`   ⚠️  Erreur suppression ${prestation.id}:`, error);
      }
    }
  }

  console.log(`\n✅ Nettoyage terminé:`);
  console.log(`   - ${deleted} doublons supprimés`);
  console.log(`   - ${kept} prestations conservées`);
  console.log(`   - Total final: ${prestations.length - deleted} prestations`);

  return { deleted, kept };
}

/**
 * Vérifie s'il y a des doublons sans les supprimer
 */
export async function detectDuplicates(): Promise<{ total: number; duplicates: number; groups: number }> {
  const prestationsSnap = await getDocs(collection(db, 'prestations'));
  const prestations: Prestation[] = prestationsSnap.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
    date: doc.data().date?.toDate() || new Date(),
    createdAt: doc.data().createdAt?.toDate() || new Date(),
    updatedAt: doc.data().updatedAt?.toDate() || new Date()
  })) as Prestation[];

  const groups = new Map<string, number>();

  prestations.forEach(prestation => {
    const dateStr = prestation.date.toISOString().split('T')[0];
    const key = `${prestation.clientId}_${prestation.clientName}_${dateStr}_${prestation.amount}`;
    groups.set(key, (groups.get(key) || 0) + 1);
  });

  let duplicateGroups = 0;
  let totalDuplicates = 0;

  groups.forEach(count => {
    if (count > 1) {
      duplicateGroups++;
      totalDuplicates += (count - 1); // Nombre de doublons à supprimer
    }
  });

  return {
    total: prestations.length,
    duplicates: totalDuplicates,
    groups: duplicateGroups
  };
}

/**
 * Corrige les prestations qui ont un clientName incorrect
 * Met à jour le clientName basé sur le clientId
 */
export async function fixPrestationClientNames(): Promise<{ fixed: number; errors: string[] }> {
  console.log('🔧 Correction des noms de clients dans les prestations...');

  const errors: string[] = [];
  let fixed = 0;

  try {
    // Charger tous les clients
    const clientsSnap = await getDocs(collection(db, 'clients'));
    const clientsMap = new Map<string, string>();

    clientsSnap.docs.forEach(doc => {
      clientsMap.set(doc.id, doc.data().name);
    });

    console.log(`📋 ${clientsMap.size} clients trouvés`);

    // Charger toutes les prestations
    const prestationsSnap = await getDocs(collection(db, 'prestations'));
    console.log(`📋 ${prestationsSnap.docs.length} prestations à vérifier`);

    // Vérifier et corriger chaque prestation
    for (const prestationDoc of prestationsSnap.docs) {
      const prestation = prestationDoc.data();
      const correctName = clientsMap.get(prestation.clientId);

      if (!correctName) {
        errors.push(`Client introuvable pour prestation ${prestationDoc.id}: clientId=${prestation.clientId}`);
        continue;
      }

      // Si le nom ne correspond pas, le corriger
      if (prestation.clientName !== correctName) {
        console.log(`🔄 Correction: "${prestation.clientName}" → "${correctName}"`);
        await updateDoc(doc(db, 'prestations', prestationDoc.id), {
          clientName: correctName,
          updatedAt: new Date()
        });
        fixed++;
      }
    }

    console.log(`✅ ${fixed} prestations corrigées`);
    if (errors.length > 0) {
      console.log(`⚠️  ${errors.length} erreurs`);
    }

    return { fixed, errors };
  } catch (error) {
    console.error('Erreur lors de la correction:', error);
    throw error;
  }
}
