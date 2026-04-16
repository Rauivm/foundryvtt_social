import type { Post, Mission, Poll, Grave, PatchNote } from "./types";

export const MODULE_ID = "foundryvtt-social";

// ─── Setting keys ─────────────────────────────────────────────────────────────

const KEYS = {
  POSTS: "posts",
  MISSIONS: "missions",
  POLLS: "polls",
  GRAVES: "graves",
  PATCHES: "patches",
} as const;

// ─── In-memory indexes for O(1) reads ─────────────────────────────────────────

export const indexes = {
  posts: new Map<string, Post>(),
  missions: new Map<string, Mission>(),
  polls: new Map<string, Poll>(),
  graves: new Map<string, Grave>(),
  patches: new Map<string, PatchNote>(),
};

function buildIndex<T extends { id: string }>(
  map: Map<string, T>,
  items: T[]
): void {
  map.clear();
  for (const item of items) map.set(item.id, item);
}

// ─── Registration ─────────────────────────────────────────────────────────────

export function registerSettings(): void {
  const g = game as Game;
  const defs: [string, unknown][] = [
    [KEYS.POSTS, []],
    [KEYS.MISSIONS, []],
    [KEYS.POLLS, []],
    [KEYS.GRAVES, []],
    [KEYS.PATCHES, []],
  ];

  for (const [key, def] of defs) {
    g.settings.register(MODULE_ID, key, {
      scope: "world",
      config: false,
      type: Array,
      default: def,
    } as any);
  }
}

// ─── Generic CRUD helpers ─────────────────────────────────────────────────────

export function getAll<T>(key: string): T[] {
  return ((game as Game).settings.get(MODULE_ID, key) as T[]) ?? [];
}

export async function saveAll<T>(key: string, items: T[]): Promise<void> {
  await (game as Game).settings.set(MODULE_ID, key, items);
}

// ─── Typed accessors ─────────────────────────────────────────────────────────

export function getPosts(): Post[] {
  return getAll<Post>(KEYS.POSTS);
}
export async function savePosts(posts: Post[]): Promise<void> {
  await saveAll(KEYS.POSTS, posts);
  buildIndex(indexes.posts, posts);
}

// export function getMissions(): Mission[] {
//   const raw = (game as Game).settings.storage.get("world")?.get(`${MODULE_ID}.${KEYS.MISSIONS}`);
//   return raw ? JSON.parse(JSON.stringify(raw)) : [];
// }

export function getMissions(): Mission[] {
  return getAll<Mission>(KEYS.MISSIONS);
}

export async function saveMissions(missions: Mission[]): Promise<void> {
  await saveAll(KEYS.MISSIONS, missions);
  buildIndex(indexes.missions, missions);
}

export function getPolls(): Poll[] {
  return getAll<Poll>(KEYS.POLLS);
}
export async function savePolls(polls: Poll[]): Promise<void> {
  await saveAll(KEYS.POLLS, polls);
  buildIndex(indexes.polls, polls);
}

export function getGraves(): Grave[] {
  return getAll<Grave>(KEYS.GRAVES);
}
export async function saveGraves(graves: Grave[]): Promise<void> {
  await saveAll(KEYS.GRAVES, graves);
  buildIndex(indexes.graves, graves);
}

export function getPatchNotes(): PatchNote[] {
  return getAll<PatchNote>(KEYS.PATCHES);
}
export async function savePatchNotes(patches: PatchNote[]): Promise<void> {
  await saveAll(KEYS.PATCHES, patches);
  buildIndex(indexes.patches, patches);
}

// ─── Hydrate indexes on ready ─────────────────────────────────────────────────

export function hydrateIndexes(): void {
  buildIndex(indexes.posts, getPosts());
  buildIndex(indexes.missions, getMissions());
  buildIndex(indexes.polls, getPolls());
  buildIndex(indexes.graves, getGraves());
  buildIndex(indexes.patches, getPatchNotes());
}
