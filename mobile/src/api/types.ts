export interface User {
  id: string;
  name: string;
  email: string;
  neighborhood: string;
  createdAt: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
}

export interface Category {
  slug: string;
  label: string;
}

export type ItemStatus = 'active' | 'reserved' | 'traded' | 'archived';

export interface Photo {
  id: string;
  url: string;
  thumbUrl: string;
  width: number;
  height: number;
}

export interface Item {
  id: string;
  title: string;
  description: string;
  priceCents: number;
  category: string;
  status: ItemStatus;
  createdAt: string;
  isMine: boolean;
  owner: { id: string; name: string; neighborhood: string };
  photos: Photo[];
}

export interface FeedEntry extends Item {
  distanceKm: number;
  alreadyProposed: boolean;
}

export interface FeedResponse {
  myItem: { id: string; title: string; priceCents: number } | null;
  radiusKm: number;
  priceWindow: { minCents: number; maxCents: number } | null;
  items: FeedEntry[];
  nextCursor: string | null;
}

export interface ItemSummary {
  id: string;
  title: string;
  priceCents: number;
  status: ItemStatus;
  thumbUrl: string | null;
}

export type ProposalStatus = 'pending' | 'accepted' | 'declined' | 'cancelled' | 'unavailable' | 'completed';
export type ProposalAction = 'accept' | 'decline' | 'cancel' | 'complete';

export interface Proposal {
  id: string;
  status: ProposalStatus;
  direction: 'sent' | 'received';
  message: string | null;
  createdAt: string;
  respondedAt: string | null;
  closedAt: string | null;
  offeredItem: ItemSummary;
  requestedItem: ItemSummary;
  counterpart: { id: string; name: string; neighborhood: string; email?: string };
  actions: ProposalAction[];
}

export interface NewItemInput {
  title: string;
  description?: string;
  priceCents: number;
  category: string;
  latitude: number;
  longitude: number;
}
