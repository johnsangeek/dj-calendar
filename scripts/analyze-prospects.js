/**
 * Script d'analyse : Examiner les prospects dans 'clients'
 *
 * Ce script analyse tous les documents dans 'clients' et génère un rapport
 * détaillé pour t'aider à décider quoi nettoyer avant la migration.
 */

const admin = require('firebase-admin');
const path = require('path');

// Initialiser Firebase Admin
const serviceAccount = require(path.join(__dirname, '../firebase-service-account.json'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function analyzeProspects() {
  console.log('🔍 Analyse des prospects dans la collection "clients"...\n');

  try {
    const clientsSnapshot = await db.collection('clients').get();
    console.log(`📊 Nombre total de documents: ${clientsSnapshot.size}\n`);

    const stats = {
      totalDocs: clientsSnapshot.size,
      prospectsInstagram: [],
      vraisClients: [],
      douteux: []
    };

    clientsSnapshot.forEach(doc => {
      const data = doc.data();
      const info = {
        id: doc.id,
        name: data.name || 'Sans nom',
        instagramHandle: data.instagramHandle || null,
        instagramThreadId: data.instagramThreadId || null,
        email: data.primaryEmail || data.email || null,
        phone: data.phone || null,
        siret: data.siret || null,
        igStatus: data.igStatus || 'N/A',
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString().split('T')[0] : 'N/A'
      };

      // Critères pour identifier un prospect
      const hasInstagram = data.instagramHandle || data.instagramThreadId;
      const hasBusinessInfo = data.siret && (data.primaryEmail || data.email || data.phone);
      const isBooked = data.igStatus === 'BOOKED';

      if (hasInstagram && !hasBusinessInfo && !isBooked) {
        // C'est un prospect pur
        stats.prospectsInstagram.push(info);
      } else if (hasBusinessInfo || isBooked) {
        // C'est un vrai client
        stats.vraisClients.push(info);
      } else {
        // Cas douteux (ni prospect ni client clair)
        stats.douteux.push(info);
      }
    });

    // Afficher le rapport
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📊 RAPPORT D\'ANALYSE');
    console.log('═══════════════════════════════════════════════════════════\n');

    console.log(`✅ Vrais clients: ${stats.vraisClients.length}`);
    console.log(`   → Ont un SIRET et/ou email/téléphone et/ou statut BOOKED\n`);

    console.log(`🎯 Prospects Instagram: ${stats.prospectsInstagram.length}`);
    console.log(`   → Ont Instagram MAIS PAS de SIRET/email/téléphone\n`);

    console.log(`❓ Cas douteux: ${stats.douteux.length}`);
    console.log(`   → N'ont ni Instagram ni infos business complètes\n`);

    // Afficher quelques exemples de prospects
    if (stats.prospectsInstagram.length > 0) {
      console.log('═══════════════════════════════════════════════════════════');
      console.log('📝 EXEMPLES DE PROSPECTS (10 premiers)');
      console.log('═══════════════════════════════════════════════════════════\n');

      stats.prospectsInstagram.slice(0, 10).forEach((p, i) => {
        console.log(`${i + 1}. ${p.name}`);
        console.log(`   Instagram: ${p.instagramHandle || 'N/A'}`);
        console.log(`   Thread ID: ${p.instagramThreadId || 'N/A'}`);
        console.log(`   Statut: ${p.igStatus}`);
        console.log(`   Créé: ${p.createdAt}`);
        console.log('');
      });
    }

    // Afficher les cas douteux pour décision manuelle
    if (stats.douteux.length > 0) {
      console.log('═══════════════════════════════════════════════════════════');
      console.log('❓ CAS DOUTEUX À EXAMINER');
      console.log('═══════════════════════════════════════════════════════════\n');
      console.log('Ces documents n\'ont ni Instagram ni infos business:');
      console.log('→ Peut-être des imports ratés ou des brouillons?\n');

      stats.douteux.forEach((p, i) => {
        console.log(`${i + 1}. ${p.name} (ID: ${p.id})`);
        console.log(`   Email: ${p.email || 'N/A'}`);
        console.log(`   Téléphone: ${p.phone || 'N/A'}`);
        console.log(`   SIRET: ${p.siret || 'N/A'}`);
        console.log(`   Créé: ${p.createdAt}`);
        console.log('');
      });
    }

    console.log('═══════════════════════════════════════════════════════════');
    console.log('💡 RECOMMANDATIONS');
    console.log('═══════════════════════════════════════════════════════════\n');

    if (stats.prospectsInstagram.length > 0) {
      console.log(`✅ ${stats.prospectsInstagram.length} prospects Instagram seront migrés automatiquement`);
    }

    if (stats.douteux.length > 0) {
      console.log(`⚠️  ${stats.douteux.length} cas douteux à examiner manuellement`);
      console.log('   → Va dans Firebase Console pour les supprimer ou compléter');
    }

    console.log('\n📌 Prochaines étapes:');
    console.log('1. Examine les cas douteux dans Firebase Console');
    console.log('2. Supprime ou complète ces documents selon tes besoins');
    console.log('3. Lance le script de migration: node scripts/migrate-prospects.js');

    console.log('\n✨ Analyse terminée !');

  } catch (error) {
    console.error('❌ Erreur lors de l\'analyse:', error);
    process.exit(1);
  }

  process.exit(0);
}

// Lancer l'analyse
analyzeProspects();
