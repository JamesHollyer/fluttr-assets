import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState } from 'react';

import { buildCandidates, type Detection } from './classifier';
import { LocalClassifier } from './local-classifier';
import { MicStream } from './mic-stream';
import { downloadModel, isModelInstalled, MODEL_PATH } from './model';
import { loadSampleWindow } from './sample';
import { searchSpecies } from '@/db/species';
import type { Region } from '@/lib/identify';

export type ModelState = 'checking' | 'missing' | 'downloading' | 'ready';
export type ListenState = 'idle' | 'starting' | 'listening' | 'error';

export type HeardSpecies = {
  code: string;
  /** Best score seen this session. */
  score: number;
  /** Score in the most recent window, 0 if not in it. */
  nowScore: number;
  firstHeard: number;
  lastHeard: number;
  windows: number;
};

export function useSoundId(region: Region = 'usca') {
  const db = useSQLiteContext();
  const [modelState, setModelState] = useState<ModelState>('checking');
  const [progress, setProgress] = useState(0);
  const [listenState, setListenState] = useState<ListenState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const [heard, setHeard] = useState<HeardSpecies[]>([]);
  const [windowsRun, setWindowsRun] = useState(0);

  const mic = useRef<MicStream | null>(null);
  const classifier = useRef<LocalClassifier | null>(null);
  const busy = useRef(false);
  const heardRef = useRef(new Map<string, HeardSpecies>());

  useEffect(() => {
    isModelInstalled()
      .then((ok) => setModelState(ok ? 'ready' : 'missing'))
      .catch(() => setModelState('missing'));
    return () => {
      mic.current?.stop().catch(() => {});
      classifier.current?.dispose().catch(() => {});
    };
  }, []);

  const download = useCallback(async () => {
    setModelState('downloading');
    setProgress(0);
    try {
      await downloadModel(setProgress);
      setModelState('ready');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setModelState('missing');
    }
  }, []);

  const applyDetections = useCallback((detections: Detection[]) => {
    const now = Date.now();
    const map = heardRef.current;
    for (const h of map.values()) h.nowScore = 0;
    for (const d of detections) {
      const h = map.get(d.code);
      if (h) {
        h.score = Math.max(h.score, d.score);
        h.nowScore = d.score;
        h.lastHeard = now;
        h.windows += 1;
      } else {
        map.set(d.code, { code: d.code, score: d.score, nowScore: d.score, firstHeard: now, lastHeard: now, windows: 1 });
      }
    }
    setHeard([...map.values()].sort((a, b) => b.lastHeard - a.lastHeard || b.score - a.score));
    setWindowsRun((n) => n + 1);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setListenState('starting');
    try {
      if (!mic.current) mic.current = new MicStream();
      const permission = await mic.current.requestPermission();
      if (permission !== 'Granted') {
        throw new Error(`Microphone permission is needed to listen for birds (status: ${permission}).`);
      }
      if (!classifier.current) {
        const c = new LocalClassifier(MODEL_PATH);
        await c.load();
        classifier.current = c;
      }
      const species = await searchSpecies(db, '');
      classifier.current.setCandidates(buildCandidates(species, region));

      heardRef.current.clear();
      setHeard([]);
      setWindowsRun(0);
      await mic.current.start({
        onLevel: setLevel,
        onWindow: (window) => {
          if (busy.current) return; // drop a window rather than queue up
          busy.current = true;
          classifier.current!
            .classify(window)
            .then(applyDetections)
            .catch((e) => setError(e instanceof Error ? e.message : String(e)))
            .finally(() => {
              busy.current = false;
            });
        },
      });
      setListenState('listening');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setListenState('error');
      await mic.current?.stop().catch(() => {});
    }
  }, [db, region, applyDetections]);

  /** Development check: run the bundled cardinal clip through the classifier. */
  const testWithSample = useCallback(async () => {
    setError(null);
    try {
      if (!classifier.current) {
        const c = new LocalClassifier(MODEL_PATH);
        await c.load();
        classifier.current = c;
      }
      const species = await searchSpecies(db, '');
      classifier.current.setCandidates(buildCandidates(species, region));
      const started = Date.now();
      const detections = await classifier.current.classify(await loadSampleWindow());
      applyDetections(detections);
      setError(`Sample classified in ${Date.now() - started} ms: ${detections.map((d) => `${d.code} ${Math.round(d.score * 100)}%`).join(', ') || 'nothing'}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [db, region, applyDetections]);

  const stop = useCallback(async () => {
    await mic.current?.stop().catch(() => {});
    setLevel(0);
    setListenState('idle');
  }, []);

  return { modelState, progress, download, listenState, error, level, heard, windowsRun, start, stop, testWithSample };
}
