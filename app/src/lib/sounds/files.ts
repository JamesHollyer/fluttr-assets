import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

import type { Recording } from '@/db/recordings';
import { MEDIA_HEADERS } from '@/lib/sounds/source';

const DIR = `${FileSystem.documentDirectory}sounds/`;

export const canStoreOffline = Platform.OS !== 'web';

export function localUriFor(id: string): string {
  return `${DIR}${id}.mp3`;
}

export async function isStoredOffline(id: string): Promise<boolean> {
  if (!canStoreOffline) return false;
  const info = await FileSystem.getInfoAsync(localUriFor(id));
  return info.exists && !info.isDirectory && (info.size ?? 0) > 1024;
}

const RETRY_WAIT_MS = 30000;

/**
 * Downloads one recording for offline playback. Resolves to the local file uri.
 * Waits and retries when the server asks us to slow down (429) or hiccups (5xx).
 */
export async function storeOffline(rec: Recording, onProgress?: (fraction: number) => void): Promise<string> {
  await FileSystem.makeDirectoryAsync(DIR, { intermediates: true });
  const dest = localUriFor(rec.id);
  const tmp = `${dest}.part`;
  for (let attempt = 0; ; attempt++) {
    const task = FileSystem.createDownloadResumable(rec.url, tmp, { headers: MEDIA_HEADERS }, (p) => {
      if (onProgress && p.totalBytesExpectedToWrite > 0) onProgress(p.totalBytesWritten / p.totalBytesExpectedToWrite);
    });
    const result = await task.downloadAsync();
    if (result && result.status === 200) {
      await FileSystem.moveAsync({ from: tmp, to: dest });
      return dest;
    }
    await FileSystem.deleteAsync(tmp, { idempotent: true });
    const status = result?.status ?? 0;
    if ((status === 429 || status >= 500) && attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_WAIT_MS * (attempt + 1)));
      continue;
    }
    throw new Error(`Download failed (${status || 'no response'})`);
  }
}

export async function removeOffline(id: string): Promise<void> {
  await FileSystem.deleteAsync(localUriFor(id), { idempotent: true });
}
