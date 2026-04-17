export const FEATURES = {
  missions: true,
  graveyard: true,
  polls: true,
  arena: true,
  patches: true,
} as const;

export type FeatureKey = keyof typeof FEATURES;
