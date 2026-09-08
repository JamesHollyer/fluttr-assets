import perchLabels from '@/assets/data/perch-v2-labels.json';
import type { SpeciesWithCount } from '@/db/species';
import type { Region } from '@/lib/identify';

export const SAMPLE_RATE = 32000;
/** Perch v2 scores 5-second windows. */
export const WINDOW_SAMPLES = 5 * SAMPLE_RATE;

export type Detection = { code: string; score: number };

export type Candidate = { index: number; code: string; logPrior: number };

/** Below this raw logit for the best candidate, treat the window as no bird. */
const MIN_LOGIT = 4;
const MIN_SCORE = 0.05;
const MAX_DETECTIONS = 5;
const MIN_USCA_RECORDS = 200;

export const PERCH_CLASSES: string[] = perchLabels.classes;

/**
 * Which of the model's ~15k classes we let it choose between, with a prior from
 * how often each is reported in the region. Restricting the softmax to regional
 * species is what turns the model's uncalibrated logits into usable scores.
 */
export function buildCandidates(species: SpeciesWithCount[], region: Region): Candidate[] {
  const byCode = new Map(species.map((s) => [s.code, s]));
  const maxLog = Math.log10(species.reduce((m, s) => Math.max(m, s.freqUsca ?? 0), 0) + 1);
  const logMin = Math.log10(MIN_USCA_RECORDS);
  const out: Candidate[] = [];
  PERCH_CLASSES.forEach((code, index) => {
    const s = byCode.get(code);
    if (!s) return;
    const freq = s.freqUsca ?? 0;
    let likelihood = 0.5;
    if (region === 'usca') {
      if (freq < MIN_USCA_RECORDS) return;
      const t = (Math.log10(freq) - logMin) / (maxLog - logMin);
      likelihood = Math.min(1, Math.max(0, t)) ** 2;
    }
    out.push({ index, code, logPrior: Math.log(0.05 + 0.95 * likelihood) });
  });
  return out;
}

/** Softmax over the candidates, with the regional prior folded in as a log-space bias. */
export function scoreLogits(logits: ArrayLike<number>, candidates: Candidate[]): Detection[] {
  let best = -Infinity;
  for (const c of candidates) best = Math.max(best, logits[c.index]);
  if (best < MIN_LOGIT) return [];

  const scored = candidates.map((c) => ({ code: c.code, z: logits[c.index] + c.logPrior }));
  const zMax = scored.reduce((m, s) => Math.max(m, s.z), -Infinity);
  let sum = 0;
  for (const s of scored) sum += Math.exp(s.z - zMax);
  return scored
    .map((s) => ({ code: s.code, score: Math.exp(s.z - zMax) / sum }))
    .filter((d) => d.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_DETECTIONS);
}

export interface SoundClassifier {
  load(): Promise<void>;
  setCandidates(candidates: Candidate[]): void;
  classify(window: Float32Array): Promise<Detection[]>;
  dispose(): Promise<void>;
}
