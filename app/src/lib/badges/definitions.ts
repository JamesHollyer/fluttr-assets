/**
 * Badge catalogue. Every badge is a rule over the local catch history, so
 * badges are earned offline and never revoked. Tiered badges share a `series`.
 */
export type BadgeCategory = 'lifelist' | 'catching' | 'streaks' | 'skills' | 'groups' | 'moments' | 'friends';

export type BadgeRule =
  | { kind: 'species'; target: number }
  | { kind: 'catches'; target: number }
  | { kind: 'streak'; target: number }
  | { kind: 'families'; target: number }
  | { kind: 'method'; method: 'sound' | 'wizard'; target: number }
  | { kind: 'group'; families: string[]; target: number }
  | { kind: 'hour'; before?: number; after?: number }
  | { kind: 'rarity'; maxFreq: number }
  | { kind: 'seasons'; target: number }
  | { kind: 'months'; target: number }
  | { kind: 'bigDay'; target: number }
  | { kind: 'repeat'; target: number }
  | { kind: 'colors'; target: number }
  | { kind: 'introduced' }
  | { kind: 'friends'; target: number };

export type Badge = {
  id: string;
  series: string;
  tier: number;
  name: string;
  description: string;
  glyph: string;
  category: BadgeCategory;
  rule: BadgeRule;
};

export const CATEGORY_LABELS: Record<BadgeCategory, string> = {
  lifelist: 'Life list',
  catching: 'Catching',
  streaks: 'Streaks',
  skills: 'Skills',
  groups: 'Bird groups',
  moments: 'Moments',
  friends: 'Friends',
};

const RAPTORS = ['Hawks, Eagles, and Kites', 'Falcons and Caracaras', 'New World Vultures', 'Osprey'];
const OWLS = ['Owls', 'Barn-Owls'];
const WARBLERS = ['New World Warblers'];
const SPARROWS = ['New World Sparrows'];
const WATERFOWL = ['Ducks, Geese, and Waterfowl'];
const GULLS = ['Gulls, Terns, and Skimmers'];
const WOODPECKERS = ['Woodpeckers'];
const HUMMINGBIRDS = ['Hummingbirds'];
const CORVIDS = ['Crows, Jays, and Magpies'];
const SHOREBIRDS = ['Sandpipers and Allies', 'Plovers and Lapwings', 'Oystercatchers', 'Stilts and Avocets'];
const HERONS = ['Herons, Egrets, and Bitterns', 'Ibises and Spoonbills'];

function tiers(
  series: string,
  category: BadgeCategory,
  rule: (target: number) => BadgeRule,
  steps: { target: number; name: string; glyph: string; description: string }[],
): Badge[] {
  return steps.map((s, i) => ({
    id: `${series}-${s.target}`,
    series,
    tier: i + 1,
    name: s.name,
    description: s.description,
    glyph: s.glyph,
    category,
    rule: rule(s.target),
  }));
}

function single(id: string, category: BadgeCategory, name: string, glyph: string, description: string, rule: BadgeRule): Badge {
  return { id, series: id, tier: 1, name, description, glyph, category, rule };
}

export const BADGES: Badge[] = [
  ...tiers('lifelist', 'lifelist', (target) => ({ kind: 'species', target }), [
    { target: 1, name: 'First Feather', glyph: '🪶', description: 'Catch your first bird.' },
    { target: 10, name: 'Fledgling', glyph: '🐣', description: '10 species on your life list.' },
    { target: 25, name: 'Flock', glyph: '🐦', description: '25 species on your life list.' },
    { target: 50, name: 'Half Century', glyph: '🌿', description: '50 species on your life list.' },
    { target: 100, name: 'Century Club', glyph: '💯', description: '100 species on your life list.' },
    { target: 200, name: 'Double Century', glyph: '🏆', description: '200 species on your life list.' },
    { target: 500, name: 'Legend', glyph: '👑', description: '500 species on your life list.' },
  ]),
  ...tiers('catches', 'catching', (target) => ({ kind: 'catches', target }), [
    { target: 10, name: 'Note Taker', glyph: '📓', description: 'Log 10 catches.' },
    { target: 50, name: 'Diarist', glyph: '📔', description: 'Log 50 catches.' },
    { target: 250, name: 'Chronicler', glyph: '📚', description: 'Log 250 catches.' },
    { target: 1000, name: 'Archivist', glyph: '🗃️', description: 'Log 1,000 catches.' },
  ]),
  ...tiers('repeat', 'catching', (target) => ({ kind: 'repeat', target }), [
    { target: 10, name: 'Old Friend', glyph: '🤝', description: 'Catch the same species 10 times.' },
    { target: 25, name: 'Regular', glyph: '☕', description: 'Catch the same species 25 times.' },
  ]),
  ...tiers('bigday', 'catching', (target) => ({ kind: 'bigDay', target }), [
    { target: 10, name: 'Big Day', glyph: '🎉', description: '10 species in a single day.' },
    { target: 25, name: 'Bigger Day', glyph: '🎊', description: '25 species in a single day.' },
  ]),
  ...tiers('streak', 'streaks', (target) => ({ kind: 'streak', target }), [
    { target: 3, name: 'Three Dawns', glyph: '🌅', description: 'Catch a bird 3 days in a row.' },
    { target: 7, name: 'Week of Wings', glyph: '📆', description: 'Catch a bird 7 days in a row.' },
    { target: 30, name: 'Monthly Migrant', glyph: '🗓️', description: 'Catch a bird 30 days in a row.' },
    { target: 100, name: 'Hundred Dawns', glyph: '☀️', description: 'Catch a bird 100 days in a row.' },
  ]),
  ...tiers('seasons', 'streaks', (target) => ({ kind: 'seasons', target }), [
    { target: 4, name: 'Four Seasons', glyph: '🍂', description: 'Catch a bird in winter, spring, summer, and fall.' },
  ]),
  ...tiers('months', 'streaks', (target) => ({ kind: 'months', target }), [
    { target: 12, name: 'Calendar Bird', glyph: '📅', description: 'Catch a bird in every month of the year.' },
  ]),
  ...tiers('sound', 'skills', (target) => ({ kind: 'method', method: 'sound', target }), [
    { target: 1, name: 'Good Ear', glyph: '👂', description: 'Catch a bird with Sound ID.' },
    { target: 10, name: 'Sharp Ear', glyph: '🎧', description: '10 catches with Sound ID.' },
    { target: 50, name: 'Golden Ear', glyph: '🎼', description: '50 catches with Sound ID.' },
  ]),
  ...tiers('wizard', 'skills', (target) => ({ kind: 'method', method: 'wizard', target }), [
    { target: 1, name: 'Sleuth', glyph: '🔍', description: 'Catch a bird with the question wizard.' },
    { target: 10, name: 'Detective', glyph: '🕵️', description: '10 catches with the question wizard.' },
  ]),
  ...tiers('families', 'skills', (target) => ({ kind: 'families', target }), [
    { target: 5, name: 'Family Tree', glyph: '🌳', description: 'Catch birds from 5 families.' },
    { target: 15, name: 'Branching Out', glyph: '🌲', description: 'Catch birds from 15 families.' },
    { target: 30, name: 'Deep Roots', glyph: '🌴', description: 'Catch birds from 30 families.' },
    { target: 60, name: 'Taxonomist', glyph: '🧬', description: 'Catch birds from 60 families.' },
  ]),
  single('rainbow', 'skills', 'Rainbow', '🌈', 'Catch birds showing 8 different colors.', { kind: 'colors', target: 8 }),
  single('talons', 'groups', 'Talons', '🦅', 'Catch 5 raptors: hawks, eagles, falcons, or vultures.', { kind: 'group', families: RAPTORS, target: 5 }),
  single('nightshift', 'groups', 'Night Shift', '🦉', 'Catch 3 kinds of owl.', { kind: 'group', families: OWLS, target: 3 }),
  single('warblerwave', 'groups', 'Warbler Wave', '💛', 'Catch 10 warblers.', { kind: 'group', families: WARBLERS, target: 10 }),
  single('lbj', 'groups', 'Little Brown Jobs', '🟤', 'Catch 10 sparrows.', { kind: 'group', families: SPARROWS, target: 10 }),
  single('puddleduck', 'groups', 'Puddle Duck', '🦆', 'Catch 10 ducks, geese, or swans.', { kind: 'group', families: WATERFOWL, target: 10 }),
  single('gullwatcher', 'groups', 'Gull Watcher', '🌊', 'Catch 5 gulls or terns.', { kind: 'group', families: GULLS, target: 5 }),
  single('drummer', 'groups', 'Drummer', '🥁', 'Catch 5 woodpeckers.', { kind: 'group', families: WOODPECKERS, target: 5 }),
  single('hummer', 'groups', 'Hummer', '✨', 'Catch 3 hummingbirds.', { kind: 'group', families: HUMMINGBIRDS, target: 3 }),
  single('corvidclub', 'groups', 'Corvid Club', '🖤', 'Catch 4 crows, jays, or magpies.', { kind: 'group', families: CORVIDS, target: 4 }),
  single('shorebird', 'groups', 'Peeps', '🏖️', 'Catch 8 shorebirds.', { kind: 'group', families: SHOREBIRDS, target: 8 }),
  single('wader', 'groups', 'Wader', '🦩', 'Catch 4 herons, egrets, or ibises.', { kind: 'group', families: HERONS, target: 4 }),
  single('earlybird', 'moments', 'Early Bird', '🌄', 'Catch a bird before 6 in the morning.', { kind: 'hour', before: 6 }),
  single('nightowl', 'moments', 'Night Owl', '🌙', 'Catch a bird after 9 at night.', { kind: 'hour', after: 21 }),
  single('rarefind', 'moments', 'Rare Find', '💎', 'Catch a species rarely reported in the US and Canada.', { kind: 'rarity', maxFreq: 20000 }),
  single('vagrant', 'moments', 'Vagrant', '🧭', 'Catch a species almost never reported here.', { kind: 'rarity', maxFreq: 2000 }),
  single('newcomer', 'moments', 'Newcomer', '🧳', 'Catch an introduced, non-native species.', { kind: 'introduced' }),
  ...tiers('friends', 'friends', (target) => ({ kind: 'friends', target }), [
    { target: 1, name: 'Flock Together', glyph: '👋', description: 'Add your first friend.' },
    { target: 5, name: 'Flock Leader', glyph: '🧑‍🤝‍🧑', description: 'Have 5 friends.' },
  ]),
];

export const BADGE_BY_ID = new Map(BADGES.map((b) => [b.id, b]));
