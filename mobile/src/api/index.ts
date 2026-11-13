import { Platform } from 'react-native';
import { request } from './client';
import type {
  AuthResponse,
  Category,
  FeedResponse,
  Item,
  NewItemInput,
  Photo,
  Proposal,
  ProposalAction,
  User,
} from './types';

export { ApiError, onSessionExpired, resolveUrl } from './client';
export { tokenStore } from './token-store';
export type * from './types';

export interface LocalImage {
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
}

export const api = {
  // auth
  register: (body: { name: string; email: string; password: string; neighborhood: string }) =>
    request<AuthResponse>('/auth/register', { method: 'POST', body, auth: false }),
  login: (body: { email: string; password: string }) =>
    request<AuthResponse>('/auth/login', { method: 'POST', body, auth: false }),
  logout: (refreshToken: string) => request<void>('/auth/logout', { method: 'POST', body: { refreshToken }, auth: false }),

  // profile
  me: () => request<User>('/me'),
  updateMe: (body: { name?: string; neighborhood?: string }) => request<User>('/me', { method: 'PATCH', body }),
  deleteMe: () => request<void>('/me', { method: 'DELETE' }),

  // items
  categories: () => request<Category[]>('/categories', { auth: false }),
  myItems: () => request<Item[]>('/items/mine'),
  item: (id: string) => request<Item>(`/items/${id}`),
  createItem: (body: NewItemInput) => request<Item>('/items', { method: 'POST', body }),
  updateItem: (id: string, body: Partial<Pick<Item, 'title' | 'description' | 'priceCents' | 'category'>>) =>
    request<Item>(`/items/${id}`, { method: 'PATCH', body }),
  archiveItem: (id: string) => request<void>(`/items/${id}`, { method: 'DELETE' }),
  deletePhoto: (itemId: string, photoId: string) => request<void>(`/items/${itemId}/photos/${photoId}`, { method: 'DELETE' }),
  async uploadPhoto(itemId: string, image: LocalImage): Promise<Photo> {
    const form = new FormData();
    const name = image.fileName ?? `foto-${Date.now()}.jpg`;
    const type = image.mimeType ?? 'image/jpeg';
    if (Platform.OS === 'web') {
      form.append('file', await (await fetch(image.uri)).blob(), name);
    } else {
      // React Native's FormData accepts a file descriptor object.
      form.append('file', { uri: image.uri, name, type } as unknown as Blob);
    }
    return request<Photo>(`/items/${itemId}/photos`, { method: 'POST', form });
  },

  // matching
  feed: (params: { myItemId?: string; radiusKm: number; cursor?: string }) => {
    const qs = new URLSearchParams({ radiusKm: String(params.radiusKm), limit: '20' });
    if (params.myItemId) qs.set('myItemId', params.myItemId);
    if (params.cursor) qs.set('cursor', params.cursor);
    return request<FeedResponse>(`/feed?${qs}`);
  },

  // proposals
  proposals: (box: 'received' | 'sent') => request<Proposal[]>(`/proposals?box=${box}`),
  proposal: (id: string) => request<Proposal>(`/proposals/${id}`),
  createProposal: (body: { offeredItemId: string; requestedItemId: string; message?: string }) =>
    request<Proposal>('/proposals', { method: 'POST', body }),
  proposalAction: (id: string, action: ProposalAction) => request<Proposal>(`/proposals/${id}/${action}`, { method: 'POST' }),
};
