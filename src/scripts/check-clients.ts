import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

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

async function checkClients() {
  console.log('🔍 Vérification des clients dans Firestore...\n');

  const clientsSnap = await getDocs(collection(db, 'clients'));

  console.log(`📊 Total clients: ${clientsSnap.docs.length}\n`);

  const clientsData = clientsSnap.docs.map(doc => ({
    id: doc.id,
    name: doc.data().name,
    stats: doc.data().stats,
    segmentation: doc.data().segmentation
  }));

  // Chercher MY BEERS
  const myBeersClients = clientsData.filter(c => c.name.includes('MY BEERS') || c.name.includes('BEERS'));

  console.log('🔍 Clients contenant "MY BEERS" ou "BEERS":');
  myBeersClients.forEach(client => {
    console.log(`\n📌 ${client.name}`);
    console.log(`   ID: ${client.id}`);
    console.log(`   Stats:`, client.stats);
    console.log(`   Segmentation:`, client.segmentation);
  });

  // Vérifier les clients sans segmentation
  const withoutSegmentation = clientsData.filter(c => !c.segmentation);
  console.log(`\n⚠️  Clients sans segmentation: ${withoutSegmentation.length}`);
  if (withoutSegmentation.length > 0) {
    withoutSegmentation.forEach(c => {
      console.log(`   - ${c.name} (${c.id})`);
    });
  }

  // Vérifier les clients sans stats
  const withoutStats = clientsData.filter(c => !c.stats || c.stats.totalPrestations === 0);
  console.log(`\n⚠️  Clients sans stats ou avec 0 prestations: ${withoutStats.length}`);
  if (withoutStats.length > 0) {
    withoutStats.forEach(c => {
      console.log(`   - ${c.name} (${c.id})`);
    });
  }
}

checkClients().then(() => {
  console.log('\n✅ Vérification terminée');
  process.exit(0);
}).catch(error => {
  console.error('❌ Erreur:', error);
  process.exit(1);
});
