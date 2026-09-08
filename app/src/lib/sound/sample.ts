import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';

import { WINDOW_SAMPLES } from './classifier';

/**
 * A 5-second Northern Cardinal window (int16 PCM, 32 kHz mono) bundled for
 * development: lets the whole classify path run on a device without a live bird.
 * Source: Xeno-canto XC569289 via Wikimedia Commons, CC BY-SA 4.0, Eric B.
 */
export async function loadSampleWindow(): Promise<Float32Array> {
  const asset = Asset.fromModule(require('@/assets/data/sample-norcar.pcm'));
  await asset.downloadAsync();
  const uri = asset.localUri ?? asset.uri;
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  const bytes = base64ToBytes(base64);
  const int16 = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
  const out = new Float32Array(WINDOW_SAMPLES);
  const n = Math.min(int16.length, WINDOW_SAMPLES);
  for (let i = 0; i < n; i++) out[i] = int16[i] / 32768;
  return out;
}

function base64ToBytes(b64: string): Uint8Array {
  const table = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = table.indexOf(clean[i]);
    const b = table.indexOf(clean[i + 1]);
    const c = i + 2 < clean.length ? table.indexOf(clean[i + 2]) : -1;
    const d = i + 3 < clean.length ? table.indexOf(clean[i + 3]) : -1;
    out[o++] = (a << 2) | (b >> 4);
    if (c >= 0) out[o++] = ((b & 15) << 4) | (c >> 2);
    if (d >= 0) out[o++] = ((c & 3) << 6) | d;
  }
  return out.subarray(0, o);
}
