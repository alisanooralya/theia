import { logger } from '#helpers/logger.js';

const RATE_LIMIT_MS = 3_000;
const MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 1_000;

function isFatalError(err) {
  const blob = String(err?.message || '') + String(err?.data || '') + String(err?.error || '');
  return /404|410|not found|invalid jid|forbidden|unauthorized/.test(blob.toLowerCase());
}

function makeDedupKey(jid, content, options) {
  let text;
  if (typeof content === 'string') text = content;
  else if (content && content.text) text = content.text;
  else if (content && content.caption) text = content.caption;
  else return null;

  const mentions = options?.mentions
    ? [...options.mentions].sort().join(',')
    : '';
  return `d:${jid}:${text}:${mentions}`;
}

export function createSendQueue(sendFn, { rateLimitMs = RATE_LIMIT_MS } = {}) {
  let chain = Promise.resolve();
  let lastSentAt = 0;
  let pending = 0;

  const groups = new Map();
  const order = [];
  let cursor = -1;
  const pendingDedup = new Map();

  let wakeResolve = null;
  const wake = () => {
    if (wakeResolve) {
      const r = wakeResolve;
      wakeResolve = null;
      r();
    }
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function nextRoundRobin(candidates) {
    if (!candidates.length) return null;
    let idx = (cursor + 1) % order.length;
    for (let i = 0; i < order.length; i++) {
      if (candidates.includes(order[idx])) {
        cursor = idx;
        return order[idx];
      }
      idx = (idx + 1) % order.length;
    }
    return candidates[0];
  }

  function selectTask() {
    const ready = [];
    for (const [jid, q] of groups) if (q.length) ready.push(jid);
    if (!ready.length) return null;

    let maxPri = -Infinity;
    for (const jid of ready) maxPri = Math.max(maxPri, groups.get(jid)[0].priority);

    const candidates =
      maxPri > 0
        ? ready.filter((j) => groups.get(j)[0].priority === maxPri)
        : ready;

    const chosen = nextRoundRobin(candidates);
    const q = groups.get(chosen);
    const task = q.shift();
    return task;
  }

  async function loop() {
    while (true) {
      const task = selectTask();
      if (!task) {
        await new Promise((res) => {
          wakeResolve = res;
        });
        continue;
      }

      const now = Date.now();
      const wait = Math.max(0, lastSentAt + rateLimitMs - now);
      if (wait > 0) await sleep(wait);

      const { jid, content, options, dedupKey } = task;
      try {
        const result = await sendFn(jid, content, options);
        lastSentAt = Date.now();
        pending--;
        if (dedupKey) pendingDedup.delete(dedupKey);
        task.resolve(result);
      } catch (err) {
        task.retryCount = (task.retryCount || 0) + 1;
        if (task.retryCount > MAX_RETRIES || isFatalError(err)) {
          pending--;
          if (dedupKey) pendingDedup.delete(dedupKey);
          logger.warn({ err: err.message, jid }, '[SendQueue] send failed permanently');
          task.reject(err);
        } else {
          const delay = BACKOFF_BASE_MS * 2 ** (task.retryCount - 1);
          logger.warn(
            { err: err.message, jid, attempt: task.retryCount, delay },
            '[SendQueue] send failed, retrying later'
          );
          pending--;
          setTimeout(() => {
            if (!groups.has(jid)) {
              groups.set(jid, []);
              order.push(jid);
            }
            const q = groups.get(jid);
            let inserted = false;
            for (let i = 0; i < q.length; i++) {
              if (task.priority > q[i].priority) {
                q.splice(i, 0, task);
                inserted = true;
                break;
              }
            }
            if (!inserted) q.push(task);
            pending++;
            wake();
          }, delay);
        }
      }
    }
  }

  function enqueue(jid, content, options, meta = {}) {
    const priority = Number(meta.priority) || 0;
    const useDedup = !!meta.dedup;

    let dedupKey = null;
    if (useDedup) {
      dedupKey = makeDedupKey(jid, content, options);
      if (dedupKey && pendingDedup.has(dedupKey)) {
        return pendingDedup.get(dedupKey);
      }
    }

    let settled = false;
    const task = {
      jid,
      content,
      options,
      priority,
      dedupKey,
      resolve: () => {},
      reject: () => {},
    };
    const p = new Promise((res, rej) => {
      task.resolve = res;
      task.reject = rej;
    });
    p.finally(() => {
      settled = true;
    });

    if (!groups.has(jid)) {
      groups.set(jid, []);
      order.push(jid);
    }
    const q = groups.get(jid);
    let inserted = false;
    for (let i = 0; i < q.length; i++) {
      if (priority > q[i].priority) {
        q.splice(i, 0, task);
        inserted = true;
        break;
      }
    }
    if (!inserted) q.push(task);

    pending++;
    if (dedupKey) pendingDedup.set(dedupKey, p);
    wake();
    return p;
  }

  loop().catch((err) =>
    logger.error({ err }, '[SendQueue] loop crashed')
  );

  return {
    enqueue,
    get pending() {
      return pending;
    },
    get rateLimitMs() {
      return rateLimitMs;
    },
    get groupCount() {
      return groups.size;
    },
  };
}
