import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';

export const MODEL_NAME = 'perch_v2_int8.onnx';
/** Rough size, for the download prompt. */
export const MODEL_SIZE_MB = 131;
const MIN_VALID_BYTES = 100 * 1024 * 1024;

const MODEL_DIR = `${FileSystem.documentDirectory}models/`;
export const MODEL_PATH = `${MODEL_DIR}${MODEL_NAME}`;

/**
 * Where to fetch the model. Until download packs exist this is a plain file URL.
 * Set EXPO_PUBLIC_MODEL_URL to override (for example a Metro-host copy in development).
 */
/**
 * Public home of the model: a GitHub release asset served from GitHub's CDN.
 * Bump the tag when the model file changes so old installs keep a matching URL.
 */
export const MODEL_RELEASE_URL = `https://github.com/JamesHollyer/fluttr-assets/releases/download/model-perch-v2-int8-1/${MODEL_NAME}`;

export function modelUrl(): string {
  const configured = process.env.EXPO_PUBLIC_MODEL_URL;
  if (configured) return configured;
  return MODEL_RELEASE_URL;
}

/** During development, a copy served from the Metro host is faster than the CDN. */
export function devModelUrl(): string | null {
  let host = Constants.expoConfig?.hostUri?.split(':')[0];
  if (!host && __DEV__) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const getDevServer = require('react-native/Libraries/Core/Devtools/getDevServer').default;
      const url: string = getDevServer().url;
      host = url.match(/^https?:\/\/([^/:]+)/)?.[1];
    } catch {
      host = undefined;
    }
  }
  return host ? `http://${host}:8090/${MODEL_NAME}` : null;
}

export async function isModelInstalled(): Promise<boolean> {
  const info = await FileSystem.getInfoAsync(MODEL_PATH);
  return info.exists && !info.isDirectory && (info.size ?? 0) >= MIN_VALID_BYTES;
}

export async function deleteModel(): Promise<void> {
  await FileSystem.deleteAsync(MODEL_PATH, { idempotent: true });
}

export async function downloadModel(onProgress: (fraction: number) => void): Promise<void> {
  const url = modelUrl();
  if (!url) throw new Error('No model URL configured');
  await FileSystem.makeDirectoryAsync(MODEL_DIR, { intermediates: true });
  const tmp = `${MODEL_PATH}.part`;
  const download = FileSystem.createDownloadResumable(url, tmp, {}, (p) => {
    if (p.totalBytesExpectedToWrite > 0) onProgress(p.totalBytesWritten / p.totalBytesExpectedToWrite);
  });
  const result = await download.downloadAsync();
  if (!result || result.status !== 200) {
    await FileSystem.deleteAsync(tmp, { idempotent: true });
    throw new Error(`Model download failed (${result?.status ?? 'no response'})`);
  }
  await FileSystem.moveAsync({ from: tmp, to: MODEL_PATH });
  if (!(await isModelInstalled())) {
    await deleteModel();
    throw new Error('Downloaded model file is incomplete');
  }
}
