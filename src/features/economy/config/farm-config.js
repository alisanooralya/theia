const DAY_MS = 24 * 60 * 60 * 1000;

export const FARM_LANDS = 1;
export const FARM_PLOT_CAPACITY = 4;
export const FARM_SEEDS_PER_PLANT = 4;

export const FARM_DEMAND = Object.freeze({
  LOW: { id: 'LOW', label: 'LOW', emoji: '📉', modifier: 0.7, weight: 0.25 },
  NORMAL: { id: 'NORMAL', label: 'NORMAL', emoji: '➖', modifier: 1.0, weight: 0.5 },
  HIGH: { id: 'HIGH', label: 'HIGH', emoji: '📈', modifier: 1.4, weight: 0.25 },
});

export const FARM_DEMAND_PERIOD_MS = 24 * 60 * 60 * 1000;

export const FARM_CROPS = Object.freeze({
  corn: {
    id: 'corn',
    name: 'Jagung',
    emoji: '🌽',
    seedId: 'corn_seed',
    seedName: 'Bibit Jagung',
    harvestId: 'corn',
    harvestName: 'Jagung',
    growthMs: 3 * DAY_MS,
    basePrice: 2600,
    aliases: ['jagung', 'corn'],
  },
  tomato: {
    id: 'tomato',
    name: 'Tomat',
    emoji: '🍅',
    seedId: 'tomato_seed',
    seedName: 'Bibit Tomat',
    harvestId: 'tomato',
    harvestName: 'Tomat',
    growthMs: 4 * DAY_MS,
    basePrice: 3200,
    aliases: ['tomat', 'tomato'],
  },
  carrot: {
    id: 'carrot',
    name: 'Wortel',
    emoji: '🥕',
    seedId: 'carrot_seed',
    seedName: 'Bibit Wortel',
    harvestId: 'carrot',
    harvestName: 'Wortel',
    growthMs: 4 * DAY_MS,
    basePrice: 3800,
    aliases: ['wortel', 'carrot'],
  },
  potato: {
    id: 'potato',
    name: 'Kentang',
    emoji: '🥔',
    seedId: 'potato_seed',
    seedName: 'Bibit Kentang',
    harvestId: 'potato',
    harvestName: 'Kentang',
    growthMs: 5 * DAY_MS,
    basePrice: 5000,
    aliases: ['kentang', 'potato'],
  },
  pumpkin: {
    id: 'pumpkin',
    name: 'Labu',
    emoji: '🎃',
    seedId: 'pumpkin_seed',
    seedName: 'Bibit Labu',
    harvestId: 'pumpkin',
    harvestName: 'Labu',
    growthMs: 5 * DAY_MS,
    basePrice: 6200,
    aliases: ['labu', 'pumpkin'],
  },
});

export function getFarmCrop(idOrAlias) {
  if (!idOrAlias) return null;
  const key = String(idOrAlias).toLowerCase();
  if (FARM_CROPS[key]) return FARM_CROPS[key];
  return (
    Object.values(FARM_CROPS).find((crop) => crop.aliases.includes(key)) ??
    null
  );
}

export function getFarmCrops() {
  return Object.values(FARM_CROPS);
}
