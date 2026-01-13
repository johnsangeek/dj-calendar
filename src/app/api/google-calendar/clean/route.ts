import { NextResponse } from 'next/server';
import { collection, getDocs, query, where, deleteDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export async function POST() {
  try {
    // Supprimer tous les bookings importés depuis Google
    const bookingsQuery = query(
      collection(db, 'bookings'),
      where('sync.provider', '==', 'google')
    );

    const bookingsSnapshot = await getDocs(bookingsQuery);

    let deletedCount = 0;
    for (const bookingDoc of bookingsSnapshot.docs) {
      await deleteDoc(doc(db, 'bookings', bookingDoc.id));
      deletedCount++;
    }

    return NextResponse.json({
      success: true,
      deleted: deletedCount
    });
  } catch (error) {
    console.error('Erreur lors du nettoyage:', error);
    return NextResponse.json(
      { error: 'Erreur lors du nettoyage' },
      { status: 500 }
    );
  }
}
