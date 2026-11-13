import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * API base URL.
 * - Set EXPO_PUBLIC_API_URL for staging/production builds.
 * - In development, defaults to the machine running Metro (port 3000), so a phone on the same
 *   Wi-Fi reaches the local API without any configuration.
 */
function devDefault(): string {
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  if (host) return `http://${host}:3000`;
  return Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';
}

export const API_URL = (process.env.EXPO_PUBLIC_API_URL || devDefault()).replace(/\/$/, '');

/** Must match the backend PRICE_TOLERANCE_PCT. Used only for UI hints; the API enforces the rule. */
export const PRICE_TOLERANCE_PCT = 20;

export const RADIUS_OPTIONS_KM = [1, 2, 5, 10, 25, 50] as const;
export const DEFAULT_RADIUS_KM = 10;
export const MAX_PHOTOS = 6;
