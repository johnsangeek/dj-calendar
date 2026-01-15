import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';

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

async function findMyBeers() {
  console.log('🔍 Recherche de tous les clients MY BEERS...\n');

  // Charger tous les clients
  const clientsSnap = await getDocs(collection(db, 'clients'));

  console.log(`📊 Total clients dans Firestore: ${clientsSnap.docs.length}\n`);

  // Filtrer ceux qui contiennent MY BEERS
  const myBeersClients = clientsSnap.docs
    .map(doc => ({
      id: doc.id,
      ...doc.data()
    }))
    .filter((client: any) =>
      client.name && (
        client.name.includes('MY BEERS') ||
        client.name.includes('BEERS')
      )
    );

  console.log(`🍺 Clients MY BEERS trouvés: ${myBeersClients.length}\n`);

  myBeersClients.forEach((client: any) => {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📌 Nom: ${client.name}`);
    console.log(`   ID: ${client.id}`);
    console.log(`   Adresse: ${client.address || 'N/A'}`);
    console.log(`   Stats:`, client.stats);
    console.log(`   Segmentation:`, client.segmentation);
    console.log('');
  });

  // Chercher les prestations de MY BEERS SAS Salon
  console.log('\n🔍 Recherche des prestations pour MY BEERS...\n');

  const prestationsSnap = await getDocs(collection(db, 'prestations'));
  const myBeersPrestations = prestationsSnap.docs
    .map(doc => ({
      id: doc.id,
      ...doc.data()
    }))
    .filter((p: any) =>
      p.clientName && (
        p.clientName.includes('MY BEERS') ||
        p.clientName.includes('BEERS')
      )
    );

  console.log(`📋 Total prestations MY BEERS: ${myBeersPrestations.length}\n`);

  // Grouper par client
  const prestationsByClient = new Map<string, any[]>();
  myBeersPrestations.forEach((p: any) => {
    if (!prestationsByClient.has(p.clientName)) {
      prestationsByClient.set(p.clientName, []);
    }
    prestationsByClient.get(p.clientName)!.push(p);
  });

  prestationsByClient.forEach((prests, clientName) => {
    console.log(`\n📊 ${clientName}: ${prests.length} prestations`);
    const total = prests.reduce((sum: number, p: any) => sum + (p.amount || 0), 0);
    console.log(`   CA total: ${total}€`);
  });
}

findMyBeers().then(() => {
  console.log('\n✅ Recherche terminée');
  process.exit(0);
}).catch(error => {
  console.error('❌ Erreur:', error);
  process.exit(1);
});
