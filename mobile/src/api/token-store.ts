import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

const KEY = 'troca.session';
const isWeb = Platform.OS === 'web';
let cache: Tokens | null = null;

/**
 * Session tokens: kept in memory for fast access and persisted in the OS keychain/keystore
 * (expo-secure-store). On web (development only) localStorage is used instead.
 */
export const tokenStore = {
  get(): Tokens | null {
    return cache;
  },

  async load(): Promise<Tokens | null> {
    try {
      const raw = isWeb ? globalThis.localStorage?.getItem(KEY) : await SecureStore.getItemAsync(KEY);
      cache = raw ? (JSON.parse(raw) as Tokens) : null;
    } catch {
      cache = null;
    }
    return cache;
  },

  async set(tokens: Tokens): Promise<void> {
    cache = tokens;
    const raw = JSON.stringify(tokens);
    if (isWeb) globalThis.localStorage?.setItem(KEY, raw);
    else await SecureStore.setItemAsync(KEY, raw);
  },

  async clear(): Promise<void> {
    cache = null;
    if (isWeb) globalThis.localStorage?.removeItem(KEY);
    else await SecureStore.deleteItemAsync(KEY);
  },
};
