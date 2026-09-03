import type { SpeciesWithCount } from '@/db/species';

export type SizeClass = 1 | 2 | 3 | 4;
export type ColorTag = 'black' | 'gray' | 'white' | 'brown' | 'red' | 'yellow' | 'green' | 'blue' | 'orange';
export type Behavior = 'feeder' | 'ground' | 'trees' | 'wire' | 'water' | 'soaring';
export type Region = 'usca' | 'middle';

export type Answers = {
  region: Region;
  /** 1–12 */
  month: number;
  size: SizeClass | null;
  colors: ColorTag[];
  behavior: Behavior | null;
};

export const SIZES: { value: SizeClass; label: string; hint: string }[] = [
  { value: 1, label: 'Sparrow-sized', hint: 'or smaller' },
  { value: 2, label: 'Robin-sized', hint: 'between sparrow and crow' },
  { value: 3, label: 'Crow-sized', hint: 'between robin and goose' },
  { value: 4, label: 'Goose-sized', hint: 'or larger' },
];

export const COLORS: { value: ColorTag; label: string; swatch: string }[] = [
  { value: 'black', label: 'Black', swatch: '#1E1E1E' },
  { value: 'gray', label: 'Gray', swatch: '#8A8F8A' },
  { value: 'white', label: 'White', swatch: '#FFFFFF' },
  { value: 'brown', label: 'Brown / buff', swatch: '#8B5A2B' },
  { value: 'red', label: 'Red / rufous', swatch: '#C8382B' },
  { value: 'yellow', label: 'Yellow', swatch: '#E8C224' },
  { value: 'green', label: 'Green', swatch: '#4C8C3F' },
  { value: 'blue', label: 'Blue / purple', swatch: '#3B6FD1' },
  { value: 'orange', label: 'Orange', swatch: '#E07A1F' },
];

export const BEHAVIORS: { value: Behavior; label: string }[] = [
  { value: 'feeder', label: 'Eating at a feeder' },
  { value: 'ground', label: 'On the ground' },
  { value: 'trees', label: 'In trees or bushes' },
  { value: 'wire', label: 'On a fence or wire' },
  { value: 'water', label: 'Swimming or wading' },
  { value: 'soaring', label: 'Soaring or flying' },
];

export const REGIONS: { value: Region; label: string; hint: string }[] = [
  { value: 'usca', label: 'United States & Canada', hint: 'Ranked by how often each bird is reported here, this month' },
  { value: 'middle', label: 'Mexico, Central America & Caribbean', hint: 'No regional ranking yet, so expect a longer list' },
];

export const MAX_COLORS = 3;
export const MAX_RESULTS = 40;

/** Below this many US/Canada records a species is treated as absent from the region. */
const MIN_USCA_RECORDS = 200;

function parseNums(csv: string | null): number[] {
  return csv ? csv.split(',').map(Number).filter((n) => !Number.isNaN(n)) : [];
}
function parseTags(csv: string | null): string[] {
  return csv ? csv.split(',') : [];
}

export type Candidate = { species: SpeciesWithCount; score: number };

/**
 * Rank species for the wizard. Size is a hard filter with tolerance for the
 * neighbouring class; colors and behavior are soft because the underlying
 * tags are approximate; regional frequency and season carry the rest.
 */
export function rankCandidates(all: SpeciesWithCount[], a: Answers): Candidate[] {
  const logMin = Math.log10(MIN_USCA_RECORDS);
  const logMax = Math.log10(all.reduce((m, s) => Math.max(m, s.freqUsca ?? 0), 0) + 1);

  const out: Candidate[] = [];
  for (const s of all) {
    const sizes = parseNums(s.sizeClasses);
    const colors = parseTags(s.colors);
    const behaviors = parseTags(s.behaviors);
    const freq = s.freqUsca ?? 0;

    // Region: how often the bird is reported at all, on a 0–1 log scale from
    // "barely present" to "the most-reported species". Squared so common birds
    // pull well clear of scarce ones.
    let likelihood = 0.5;
    let season = 1;
    if (a.region === 'usca') {
      if (freq < MIN_USCA_RECORDS) continue;
      const t = (Math.log10(freq) - logMin) / (logMax - logMin);
      likelihood = Math.min(1, Math.max(0, t)) ** 2;

      // Season: share of the year's records that fall in this month (1 = even).
      // A gentle nudge for residents; a real penalty only when the bird is
      // essentially absent this month.
      const months = parseNums(s.freqMonths);
      const total = months.reduce((x, y) => x + y, 0);
      if (months.length === 12 && total > 0) {
        const share = (months[a.month - 1] / total) * 12;
        season = share < 0.2 ? 0.25 : 0.7 + 0.3 * Math.min(share, 1.5) / 1.5;
      }
    }

    // Size: hard filter, with the neighbouring class allowed at a discount.
    let sizeScore = 1;
    if (a.size != null && sizes.length) {
      if (sizes.includes(a.size)) sizeScore = 1;
      else if (sizes.some((z) => Math.abs(z - a.size!) === 1)) sizeScore = 0.3;
      else continue;
    }

    // Colors: fraction of the picked colors the bird actually shows.
    let colorScore = 1;
    if (a.colors.length) {
      const matched = a.colors.filter((c) => colors.includes(c)).length;
      colorScore = matched === 0 ? 0.05 : 0.2 + 0.8 * (matched / a.colors.length);
    }

    // Behavior: soft, because the tags are family-level.
    let behaviorScore = 1;
    if (a.behavior) {
      behaviorScore = behaviors.includes(a.behavior) ? 1 : 0.35;
    }

    const score = sizeScore * colorScore * behaviorScore * (0.05 + 0.95 * likelihood) * season;
    out.push({ species: s, score });
  }

  out.sort((x, y) => y.score - x.score);
  return out.slice(0, MAX_RESULTS);
}

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function summarizeAnswers(a: Answers): string {
  const parts: string[] = [];
  parts.push(a.region === 'usca' ? `US & Canada, ${MONTHS[a.month - 1]}` : 'Mexico to Caribbean');
  if (a.size) parts.push(SIZES.find((s) => s.value === a.size)!.label.toLowerCase());
  if (a.colors.length) parts.push(a.colors.join(', '));
  if (a.behavior) parts.push(BEHAVIORS.find((b) => b.value === a.behavior)!.label.toLowerCase());
  return parts.join(' · ');
}
