export type ClientLifecycle = 'actif' | 'en_veille' | 'a_relancer';

export interface ClientStats {
  firstCollaborationAt?: Date;
  lastCollaborationAt?: Date;
  totalPrestations: number;
  totalRevenue: number;
  averageAmount: number;
  minAmount: number;
  maxAmount: number;
  daysInactive: number;
}

export interface ClientSegmentation {
  vip: boolean;
  lifecycle: ClientLifecycle;
}

export interface PrestationInput {
  clientId: string;
  clientName: string;
  invoiceNumber?: string;
  date: Date;
  amount: number;
}

export function computeClientStats(prestations: PrestationInput[], now: Date): ClientStats {
  const sorted = [...prestations].sort((a, b) => a.date.getTime() - b.date.getTime());

  let total = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (const p of sorted) {
    total += p.amount;
    min = Math.min(min, p.amount);
    max = Math.max(max, p.amount);
  }

  const totalPrestations = sorted.length;
  const totalRevenue = total;
  const averageAmount = totalPrestations > 0 ? totalRevenue / totalPrestations : 0;
  const minAmount = totalPrestations > 0 ? min : 0;
  const maxAmount = totalPrestations > 0 ? max : 0;
  const firstCollaborationAt = totalPrestations > 0 ? sorted[0].date : undefined;
  const lastCollaborationAt = totalPrestations > 0 ? sorted[totalPrestations - 1].date : undefined;

  const daysInactive = lastCollaborationAt
    ? Math.floor((now.getTime() - lastCollaborationAt.getTime()) / (1000 * 60 * 60 * 24))
    : Number.POSITIVE_INFINITY;

  return {
    firstCollaborationAt,
    lastCollaborationAt,
    totalPrestations,
    totalRevenue,
    averageAmount,
    minAmount,
    maxAmount,
    daysInactive,
  };
}

export function computeSegmentation(stats: ClientStats): ClientSegmentation {
  const lifecycle: ClientLifecycle =
    stats.daysInactive < 90
      ? 'actif'
      : stats.daysInactive <= 365
        ? 'en_veille'
        : stats.totalPrestations > 0
          ? 'a_relancer'
          : 'a_relancer';

  const vip =
    stats.totalPrestations >= 10 ||
    stats.totalRevenue >= 5000 ||
    (stats.daysInactive < 90 && stats.totalPrestations >= 5);

  return { vip, lifecycle };
}
