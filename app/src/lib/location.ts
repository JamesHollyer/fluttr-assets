import * as Location from 'expo-location';

export type Coords = { lat: number; lng: number };

/**
 * Best-effort foreground location for tagging a catch. Never throws and never
 * blocks the catch: returns null if permission is denied or a fix takes too long.
 */
export async function captureLocation(timeoutMs = 8000): Promise<Coords | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;

    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs));
    const fix = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      timeout,
    ]);
    if (fix) return { lat: fix.coords.latitude, lng: fix.coords.longitude };

    const last = await Location.getLastKnownPositionAsync();
    return last ? { lat: last.coords.latitude, lng: last.coords.longitude } : null;
  } catch {
    return null;
  }
}
