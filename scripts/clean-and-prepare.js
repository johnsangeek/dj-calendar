/**
 * Script de nettoyage : Supprimer les clients incomplets
 *
 * Ce script supprime tous les clients qui n'ont pas d'informations complètes
 * (pas de SIRET, pas d'email, pas de téléphone).
 *
 * Tu pourras ensuite les réimporter proprement via le CSV avec toutes leurs infos.
 */

const admin = require('firebase-admin');
const path = require('path');

// Initialiser Firebase Admin
const serviceAccount = require(path.join(__dirname, '../firebase-service-account.json'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function cleanIncompleteClients() {
  console.log('🧹 Nettoyage des clients incomplets...\n');

  try {
    // 1. Charger tous les clients
    const clientsSnapshot = await db.collection('clients').get();
    console.log(`📊 Nombre total de clients: ${clientsSnapshot.size}\n`);

    const toDelete = [];
    const toKeep = [];

    clientsSnapshot.forEach(doc => {
      const data = doc.data();

      // Critères pour identifier un client incomplet à supprimer
      const hasBusinessInfo = data.siret || data.primaryEmail || data.email || data.phone;

      if (!hasBusinessInfo) {
        // Client incomplet → À supprimer
        toDelete.push({
          id: doc.id,
          name: data.name || 'Sans nom'
        });
      } else {
        // Vrai client → À garder
        toKeep.push({
          id: doc.id,
          name: data.name || 'Sans nom'
        });
      }
    });

    console.log('═══════════════════════════════════════════════════════════');
    console.log('📋 RÉSUMÉ DU NETTOYAGE');
    console.log('═══════════════════════════════════════════════════════════\n');

    console.log(`✅ Clients à CONSERVER: ${toKeep.length}`);
    if (toKeep.length > 0) {
      console.log('\nListe des clients conservés:');
      toKeep.forEach((c, i) => {
        console.log(`   ${i + 1}. ${c.name}`);
      });
    }

    console.log(`\n🗑️  Clients à SUPPRIMER: ${toDelete.length}`);
    if (toDelete.length > 0) {
      console.log('\nListe des clients à supprimer:');
      toDelete.forEach((c, i) => {
        console.log(`   ${i + 1}. ${c.name}`);
      });
    }

    if (toDelete.length === 0) {
      console.log('\n✨ Aucun client à supprimer. Base de données déjà propre !');
      process.exit(0);
    }

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('⚠️  ATTENTION');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`\n${toDelete.length} clients vont être SUPPRIMÉS DÉFINITIVEMENT.`);
    console.log('\n💡 Conseil: Tu pourras les réimporter ensuite via le CSV avec');
    console.log('   toutes leurs infos complètes (Instagram, email, téléphone).\n');

    console.log('🔄 Début de la suppression...\n');

    // 2. Supprimer les clients incomplets par batch
    let batch = db.batch();
    let batchCount = 0;
    let totalDeleted = 0;

    for (const client of toDelete) {
      const clientRef = db.collection('clients').doc(client.id);
      batch.delete(clientRef);
      batchCount++;
      totalDeleted++;

      // Firebase limite les batch à 500 opérations
      if (batchCount >= 500) {
        await batch.commit();
        console.log(`✓ Supprimé ${totalDeleted}/${toDelete.length} clients...`);
        batchCount = 0;
        batch = db.batch();
      }
    }

    // Commit le dernier batch
    if (batchCount > 0) {
      await batch.commit();
      console.log(`✓ Supprimé ${totalDeleted}/${toDelete.length} clients...`);
    }

    console.log('\n✅ Nettoyage terminé avec succès !');
    console.log(`📊 Résumé:`);
    console.log(`   - ${totalDeleted} clients incomplets supprimés`);
    console.log(`   - ${toKeep.length} vrais clients conservés`);

    console.log('\n📌 Prochaines étapes:');
    console.log('1. Va sur http://localhost:3001/crm/prospection');
    console.log('2. Clique sur "Import CSV"');
    console.log('3. Importe ton fichier dj_leads_FINAL_PROSPECT.csv');
    console.log('4. Tous tes prospects seront créés dans la collection "prospects" avec toutes leurs infos !');

  } catch (error) {
    console.error('❌ Erreur lors du nettoyage:', error);
    process.exit(1);
  }

  process.exit(0);
}

// Lancer le nettoyage
cleanIncompleteClients();
