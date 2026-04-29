/**
 * Script de migration : Déplacer les prospects de 'clients' vers 'prospects'
 *
 * Ce script identifie tous les prospects Instagram dans la collection 'clients'
 * et les déplace vers la nouvelle collection 'prospects'.
 *
 * Critères pour identifier un prospect :
 * - A un handle Instagram OU un Thread ID Instagram
 * - N'a PAS de SIRET + (email OU téléphone)
 * - N'a PAS le statut 'BOOKED'
 */

const admin = require('firebase-admin');
const path = require('path');

// Initialiser Firebase Admin
const serviceAccount = require(path.join(__dirname, '../firebase-service-account.json'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function migrateProspects() {
  console.log('🚀 Début de la migration des prospects...\n');

  try {
    // 1. Charger tous les clients
    const clientsSnapshot = await db.collection('clients').get();
    console.log(`📊 Nombre total de documents dans 'clients': ${clientsSnapshot.size}\n`);

    let prospectsCount = 0;
    let clientsCount = 0;
    let skippedCount = 0;
    const prospectsToMigrate = [];

    // 2. Identifier les prospects
    clientsSnapshot.forEach(doc => {
      const data = doc.data();

      // Critères pour identifier un prospect
      const hasInstagram = data.instagramHandle || data.instagramThreadId;
      const hasBusinessInfo = data.siret && (data.primaryEmail || data.email || data.phone);
      const isBooked = data.igStatus === 'BOOKED';

      if (hasInstagram && !hasBusinessInfo && !isBooked) {
        // C'est un prospect !
        prospectsToMigrate.push({
          id: doc.id,
          data: data
        });
        prospectsCount++;
      } else {
        // C'est un vrai client
        clientsCount++;
      }
    });

    console.log(`✅ Prospects identifiés: ${prospectsCount}`);
    console.log(`👥 Vrais clients: ${clientsCount}\n`);

    if (prospectsCount === 0) {
      console.log('✨ Aucun prospect à migrer. Migration terminée !');
      process.exit(0);
    }

    // 3. Demander confirmation
    console.log(`⚠️  Tu es sur le point de migrer ${prospectsCount} prospects.`);
    console.log('📝 Les prospects seront COPIÉS vers "prospects" puis SUPPRIMÉS de "clients".\n');

    // En mode automatique pour ce script
    console.log('🔄 Début de la migration...\n');

    // 4. Copier vers 'prospects' et supprimer de 'clients'
    let batch = db.batch();
    let batchCount = 0;
    let totalMigrated = 0;

    for (const prospect of prospectsToMigrate) {
      // Copier vers 'prospects'
      const prospectRef = db.collection('prospects').doc(prospect.id);
      batch.set(prospectRef, prospect.data);

      // Supprimer de 'clients'
      const clientRef = db.collection('clients').doc(prospect.id);
      batch.delete(clientRef);

      batchCount++;
      totalMigrated++;

      // Firebase limite les batch à 500 opérations
      if (batchCount >= 250) { // 250 set + 250 delete = 500 opérations
        await batch.commit();
        console.log(`✓ Migré ${totalMigrated}/${prospectsCount} prospects...`);
        batchCount = 0;
        batch = db.batch(); // IMPORTANT: Créer un nouveau batch
      }
    }

    // Commit le dernier batch
    if (batchCount > 0) {
      await batch.commit();
      console.log(`✓ Migré ${totalMigrated}/${prospectsCount} prospects...`);
    }

    console.log('\n✅ Migration terminée avec succès !');
    console.log(`📊 Résumé:`);
    console.log(`   - ${prospectsCount} prospects migrés vers 'prospects'`);
    console.log(`   - ${clientsCount} vrais clients conservés dans 'clients'`);

  } catch (error) {
    console.error('❌ Erreur lors de la migration:', error);
    process.exit(1);
  }

  process.exit(0);
}

// Lancer la migration
migrateProspects();
