'use client';

import { useCallback, useRef } from 'react';

interface CommuneResult {
  nom: string;
  code: string;
  codesPostaux: string[];
}

export function usePostalCodeLookup(
  onCityFound: (city: string) => void
) {
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const lookup = useCallback(
    (postalCode: string) => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      // Only search when we have a valid 5-digit French postal code
      if (!/^\d{5}$/.test(postalCode)) return;

      debounceRef.current = setTimeout(async () => {
        try {
          const res = await fetch(
            `https://geo.api.gouv.fr/communes?codePostal=${postalCode}&fields=nom&limit=1`
          );
          if (!res.ok) return;
          const data: CommuneResult[] = await res.json();
          if (data.length > 0) {
            onCityFound(data[0].nom);
          }
        } catch {
          // Silently fail - user can still type the city manually
        }
      }, 300);
    },
    [onCityFound]
  );

  return lookup;
}
