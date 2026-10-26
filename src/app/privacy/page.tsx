import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Politique de confidentialité — DJ Booker Pro',
  description: 'Politique de confidentialité de DJ Booker Pro / DJ Invoicer',
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12 text-gray-800">
      <h1 className="mb-2 text-2xl font-bold">Politique de confidentialité</h1>
      <p className="mb-8 text-sm text-gray-500">DJ Booker Pro / DJ Invoicer — dernière mise à jour : 26 octobre 2026</p>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">À quoi sert cette application</h2>
        <p>
          DJ Booker Pro et DJ Invoicer sont des outils personnels de gestion pour un DJ indépendant
          (JOHNSANTI) : suivi des prestations, facturation et envoi des factures à ses clients. Ils ne sont pas
          destinés au grand public et n&apos;ont qu&apos;un seul utilisateur : leur propriétaire.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">Données Google utilisées</h2>
        <p className="mb-2">
          Avec l&apos;autorisation de son propriétaire uniquement, l&apos;application accède à son compte Google pour :
        </p>
        <ul className="list-disc space-y-1 pl-6">
          <li>
            <strong>Google Agenda</strong> : lire et mettre à jour les événements de son agenda de prestations, afin de
            créer automatiquement les réservations et les factures correspondantes.
          </li>
          <li>
            <strong>Gmail</strong> : envoyer les factures par e-mail à ses clients et consulter les échanges liés à ces
            envois.
          </li>
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">Ce que nous faisons de ces données</h2>
        <p>
          Les données Google ne servent qu&apos;aux fonctions décrites ci-dessus. Elles ne sont ni vendues, ni louées,
          ni partagées avec des tiers, ni utilisées à des fins publicitaires, ni utilisées pour entraîner des modèles
          d&apos;intelligence artificielle. L&apos;utilisation des informations reçues des API Google respecte la
          politique de Google sur les données utilisateur des services API, y compris les exigences d&apos;utilisation
          limitée.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">Stockage et sécurité</h2>
        <p>
          Les jetons d&apos;accès Google sont stockés chiffrés dans la base de données privée de l&apos;application
          (Google Firebase), accessible uniquement à son propriétaire. L&apos;accès à l&apos;application est protégé par
          un mot de passe.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">Retirer l&apos;accès</h2>
        <p>
          Le propriétaire peut à tout moment retirer l&apos;accès de l&apos;application à son compte Google depuis{' '}
          <a className="text-blue-700 underline" href="https://myaccount.google.com/connections">
            myaccount.google.com/connections
          </a>
          . Les jetons enregistrés cessent alors d&apos;être valides.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">Contact</h2>
        <p>
          Pour toute question :{' '}
          <a className="text-blue-700 underline" href="mailto:djjohnsanti@gmail.com">
            djjohnsanti@gmail.com
          </a>
        </p>
      </section>
    </main>
  );
}
