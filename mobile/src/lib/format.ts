import type { ItemStatus, ProposalStatus } from '@/api';

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const brlRound = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

export const formatPrice = (cents: number) => (cents % 100 === 0 ? brlRound : brl).format(cents / 100);

export const formatDistance = (km: number) => `${km.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`;

/** Parses user input like "1.200", "1200,50" or "R$ 99" into cents. Returns null if invalid. */
export function parsePriceToCents(input: string): number | null {
  const cleaned = input.replace(/[^\d,]/g, '');
  if (!cleaned) return null;
  const [int = '', dec = ''] = cleaned.split(',');
  if (!int && !dec) return null;
  const cents = Number(int || '0') * 100 + Number((dec + '00').slice(0, 2));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

/** Same symmetric rule as the API (see backend/src/matching/price.ts). */
export function isPriceCompatible(a: number, b: number, tolerancePct: number): boolean {
  const factor = 100 + tolerancePct;
  return b >= Math.ceil((a * 100) / factor) && b <= Math.floor((a * factor) / 100);
}

export const ITEM_STATUS_LABEL: Record<ItemStatus, string> = {
  active: 'Disponível',
  reserved: 'Reservado',
  traded: 'Trocado',
  archived: 'Removido',
};

export const PROPOSAL_STATUS_LABEL: Record<ProposalStatus, string> = {
  pending: 'Aguardando resposta',
  accepted: 'Aceita',
  declined: 'Recusada',
  cancelled: 'Cancelada',
  unavailable: 'Indisponível',
  completed: 'Troca concluída',
};

export function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'agora';
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  const d = Math.floor(s / 86400);
  return d === 1 ? 'ontem' : `há ${d} dias`;
}
