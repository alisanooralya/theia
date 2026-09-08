import NodeCache from 'node-cache';

const GROUPS_TTL = 60;
const BANNED_TTL = 60;
const PROCESSED_MSG_TTL = 120;

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

// ID pesan masuk yang sudah diproses. Baileys kadang mengantar pesan
// yang sama lebih dari sekali (reconnect/sync multi-device); tanpa ini
// satu command bisa dieksekusi berulang (mis. chat terkirim 2-3x).
export const processedMsgCache = new NodeCache({
  stdTTL: PROCESSED_MSG_TTL,
  checkperiod: 60,
  useClones: false,
  maxKeys: 10000,
});
