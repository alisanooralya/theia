import NodeCache from 'node-cache';

const GROUPS_TTL = 60;
const BANNED_TTL = 60;

export const groupCache = new NodeCache({
  stdTTL: GROUPS_TTL,
  checkperiod: 30,
  useClones: false,
  maxKeys: 500,
});

export const bannedCache = new NodeCache({
  stdTTL: BANNED_TTL,
  checkperiod: 30,
  useClones: false,
  maxKeys: 5000,
});
