import { useSQLiteContext } from 'expo-sqlite';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { onSyncRequested, syncOnce } from './sync';
import { claimLocalSightings, countUnsyncedSightings } from '@/db/sightings';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export type SyncStatus = 'disabled' | 'signed-out' | 'idle' | 'syncing' | 'error';

type SyncState = {
  status: SyncStatus;
  lastSyncedAt: number | null;
  pending: number;
  error: string | null;
  syncNow: () => Promise<void>;
};

const SyncContext = createContext<SyncState | null>(null);

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const db = useSQLiteContext();
  const { user, configured } = useAuth();
  const [runState, setRunState] = useState<'idle' | 'syncing' | 'error'>('idle');
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);
  const queued = useRef(false);
  const userId = user?.id ?? null;

  const refreshPending = useCallback(async () => {
    setPending(await countUnsyncedSightings(db, userId));
  }, [db, userId]);

  const syncNow = useCallback(async () => {
    if (!supabase || !userId) return;
    if (running.current) {
      queued.current = true;
      return;
    }
    running.current = true;
    setRunState('syncing');
    try {
      await syncOnce(db, supabase, userId);
      setLastSyncedAt(Date.now());
      setError(null);
      setRunState('idle');
    } catch (e) {
      // Offline or a server problem: keep the data local and try again later.
      setError(e instanceof Error ? e.message : String(e));
      setRunState('error');
    } finally {
      running.current = false;
      await refreshPending();
      if (queued.current) {
        queued.current = false;
        syncNow().catch(() => {});
      }
    }
  }, [db, userId, refreshPending]);

  // Sign-in: adopt catches made before signing in, count them, then sync.
  useEffect(() => {
    if (!configured || !userId) return;
    claimLocalSightings(db, userId)
      .then(() => refreshPending())
      .then(() => syncNow())
      .catch(console.error);
  }, [configured, userId, db, refreshPending, syncNow]);

  // Sync whenever the app comes to the foreground and whenever a screen asks.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') syncNow().catch(() => {});
    });
    const off = onSyncRequested(() => {
      refreshPending().catch(() => {});
      syncNow().catch(() => {});
    });
    return () => {
      sub.remove();
      off();
    };
  }, [syncNow, refreshPending]);

  const status: SyncStatus = !configured ? 'disabled' : !userId ? 'signed-out' : runState;
  const value = useMemo<SyncState>(() => ({ status, lastSyncedAt, pending, error, syncNow }), [status, lastSyncedAt, pending, error, syncNow]);
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncState {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync must be used inside SyncProvider');
  return ctx;
}
