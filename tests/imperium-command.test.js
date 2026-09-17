// UI flow .imperium: list diff (Button single_select), quick reply fate,
// edit pesan fate saat blessing/curse dipilih. Service di-stub; sock di-mock.
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  IMPERIUM_REVEAL_DELAY_MS,
  IMPERIUM_USAGE,
  clearFateKeys,
  diffMenuRows,
  executeImperium,
  fateBody,
  fateRevealView,
  sendPickResult,
  statusBody,
} from '#commands/modules/rpg/imperium.js';

beforeEach(() => {
  clearFateKeys();
});

function mockCtx(args = [], { quoted = null, sendMessageImpl = null } = {}) {
  const calls = { replies: [], sends: [], fails: [], relayed: [] };
  const sock = {
    async relayMessage(jid, message, opts) {
      calls.relayed.push({ jid, message, opts });
    },
    async sendMessage(jid, content) {
      if (sendMessageImpl) return sendMessageImpl(jid, content);
      calls.sends.push({ jid, content });
      return { key: { id: 'sent1' } };
    },
  };
  const ctx = {
    sock,
    jid: 'room@g.us',
    sender: 'u@s.whatsapp.net',
    args,
    quoted,
    async reply(text) {
      calls.replies.push(text);
      return { key: { id: 'reply1' } };
    },
    async fail(text) {
      calls.fails.push(text);
    },
  };
  return { ctx, calls };
}

const REWARD = { coin: 60000, exp: 500, cerelia: 5 };

function stubStatus() {
  return {
    weekId: '2026-W38',
    level: 16,
    minLevel: 16,
    canEnter: true,
    weeklyCard: { id: 'luuk', name: 'Luuk', role: 'Attacker' },
    diffs: [
      {
        diff: 1,
        bossName: 'Husk Squire',
        cleared: true,
        unlocked: true,
        reward: REWARD,
      },
      {
        diff: 2,
        bossName: 'Husk Knight',
        cleared: false,
        unlocked: true,
        reward: REWARD,
      },
      {
        diff: 3,
        bossName: 'Rend Caller',
        cleared: false,
        unlocked: true,
        reward: REWARD,
      },
      {
        diff: 4,
        bossName: 'Apex Revenant',
        cleared: false,
        unlocked: false,
        reward: REWARD,
      },
      {
        diff: 5,
        bossName: 'Imperium Tyrant',
        cleared: false,
        unlocked: false,
        reward: REWARD,
      },
    ],
  };
}

const stubService = {
  async status() {
    return stubStatus();
  },
  async start(_userId, diff) {
    return {
      weekId: '2026-W38',
      diff,
      bossName: `Boss ${diff}`,
      slots: ['A', 'B', 'C'],
    };
  },
  async pick() {
    return {
      won: true,
      status: 'WIN',
      weekId: '2026-W38',
      diff: 2,
      bossName: 'Husk Knight',
      fate: {
        kind: 'blessing',
        name: 'Savage Echo',
        icon: '🩸',
        reveal: 'Efek rahasia terungkap.',
      },
      rounds: 3,
      playerHp: 100,
      enemyHp: 0,
      rewards: { ...REWARD },
      leveledUp: false,
      cleared: [1, 2],
    };
  },
};

function interactiveMessage(calls) {
  assert.equal(calls.relayed.length, 1);
  return calls.relayed[0].message.interactiveMessage;
}

describe('imperium diff list (Button single_select)', () => {
  it('hanya diff playable yang jadi baris, id me-routing balik ke command', () => {
    const rows = diffMenuRows(stubStatus());
    assert.deepEqual(
      rows.map((r) => r.id),
      ['.imperium 2', '.imperium 3']
    );
    for (const row of rows) {
      assert.ok(row.title.length > 0 && row.description.length > 0);
    }
  });

  it('.imperium mengirim list diff via Button', async () => {
    const { ctx, calls } = mockCtx([]);
    await executeImperium(ctx, { service: stubService });
    const msg = interactiveMessage(calls);
    const select = msg.nativeFlowMessage.buttons.find(
      (b) => b.name === 'single_select'
    );
    assert.ok(select);
    const params = JSON.parse(select.buttonParamsJson);
    assert.equal(params.sections.length, 1);
    assert.deepEqual(
      params.sections[0].rows.map((r) => r.id),
      ['.imperium 2', '.imperium 3']
    );
    assert.ok(msg.body.text.includes('Husk Squire'));
    assert.equal(calls.replies.length, 0);
  });

  it('tanpa diff playable -> fallback teks biasa', async () => {
    const allClear = {
      ...stubStatus(),
      diffs: stubStatus().diffs.map((d) => ({ ...d, cleared: true })),
    };
    const { ctx, calls } = mockCtx([]);
    await executeImperium(ctx, {
      service: { ...stubService, status: async () => allClear },
    });
    assert.equal(calls.relayed.length, 0);
    assert.equal(calls.replies.length, 1);
    assert.ok(calls.replies[0].includes('Clear'));
  });
});

describe('imperium fate via teks + pick manual', () => {
  it('.imperium 2 mengirim chat fate teks (tetap blind) + hint pick', async () => {
    const { ctx, calls } = mockCtx(['2']);
    await executeImperium(ctx, { service: stubService });
    assert.equal(calls.relayed.length, 0);
    assert.equal(calls.replies.length, 1);
    assert.ok(calls.replies[0].includes('CHOOSE YOUR FATE'));
    assert.ok(calls.replies[0].includes('.imperium pick <A/B/C>'));
    assert.ok(!calls.replies[0].includes('Savage Echo'));
    assert.equal(
      fateBody({ diff: 2, bossName: 'X' }).includes('Savage Echo'),
      false
    );
  });

  it('pick dengan quote pesan fate -> edit 2x (reveal lalu result)', async () => {
    const fateKey = { remoteJid: 'room@g.us', id: 'fate1' };
    const sleeps = [];
    const { ctx, calls } = mockCtx(['pick', 'A'], { quoted: { key: fateKey } });
    await executeImperium(ctx, {
      service: stubService,
      sleepFn: async (ms) => sleeps.push(ms),
    });
    assert.equal(calls.sends.length, 2);
    assert.deepEqual(calls.sends[0].content.edit, fateKey);
    assert.deepEqual(calls.sends[1].content.edit, fateKey);
    assert.ok(calls.sends[0].content.text.includes('BLESSING'));
    assert.ok(!calls.sends[0].content.text.includes('CLEAR'));
    assert.ok(calls.sends[1].content.text.includes('CLEAR'));
    assert.deepEqual(sleeps, [IMPERIUM_REVEAL_DELAY_MS]);
    assert.equal(calls.replies.length, 0);
  });

  it('alur penuh: fate menu -> pick -> edit reveal -> delay -> edit result', async () => {
    const sleeps = [];
    const sleepFn = async (ms) => sleeps.push(ms);
    const m1 = mockCtx(['2']);
    await executeImperium(m1.ctx, { service: stubService, sleepFn });
    assert.equal(m1.calls.replies.length, 1);
    const m2 = mockCtx(['pick', 'A']);
    const out = await executeImperium(m2.ctx, {
      service: stubService,
      sleepFn,
    });
    assert.deepEqual(out, { edited: true });
    assert.equal(m2.calls.sends.length, 2);
    assert.deepEqual(m2.calls.sends[0].content.edit, { id: 'reply1' });
    assert.deepEqual(m2.calls.sends[1].content.edit, { id: 'reply1' });
    assert.equal(
      m2.calls.sends[0].content.text,
      fateRevealView(await stubService.pick())
    );
    assert.ok(m2.calls.sends[1].content.text.includes('CLEAR'));
    assert.deepEqual(sleeps, [IMPERIUM_REVEAL_DELAY_MS]);
    assert.equal(m2.calls.replies.length, 0);
  });

  it('alur kalah: edit reveal curse lalu edit result lose', async () => {
    const loseService = {
      ...stubService,
      pick: async () => ({
        won: false,
        status: 'LOSE',
        weekId: '2026-W38',
        diff: 2,
        bossName: 'Husk Knight',
        fate: {
          kind: 'curse',
          name: 'Apex Hunger',
          icon: '👹',
          reveal: 'ATK Boss meningkat.',
        },
        rounds: 5,
        playerHp: 0,
        enemyHp: 10,
        rewards: null,
      }),
    };
    const sleeps = [];
    const sleepFn = async (ms) => sleeps.push(ms);
    await executeImperium(mockCtx(['2']).ctx, {
      service: loseService,
      sleepFn,
    });
    const { ctx, calls } = mockCtx(['pick', 'B']);
    await executeImperium(ctx, { service: loseService, sleepFn });
    assert.equal(calls.sends.length, 2);
    assert.ok(calls.sends[0].content.text.includes('CURSE'));
    assert.ok(!calls.sends[0].content.text.includes('Kalah'));
    assert.ok(calls.sends[1].content.text.includes('Kalah'));
    assert.deepEqual(sleeps, [IMPERIUM_REVEAL_DELAY_MS]);
  });

  it('pick diketik manual tanpa menu (tanpa key) -> sekali reply full', async () => {
    const { ctx, calls } = mockCtx(['pick', 'B']);
    const out = await sendPickResult(ctx, await stubService.pick());
    assert.deepEqual(out, { edited: false });
    assert.equal(calls.sends.length, 0);
    assert.equal(calls.replies.length, 1);
    assert.ok(calls.replies[0].includes('CLEAR'));
  });

  it('edit gagal -> fallback reply', async () => {
    const fateKey = { remoteJid: 'room@g.us', id: 'fate1' };
    const { ctx, calls } = mockCtx(['pick', 'A'], {
      quoted: { key: fateKey },
      sendMessageImpl: async () => {
        throw new Error('edit failed');
      },
    });
    const out = await sendPickResult(ctx, await stubService.pick(), {
      sleepFn: async () => {},
    });
    assert.deepEqual(out, { edited: false });
    assert.equal(calls.replies.length, 2);
    assert.ok(calls.replies[0].includes('BLESSING'));
    assert.ok(calls.replies[1].includes('CLEAR'));
  });

  it('argumen invalid -> usage', async () => {
    const { ctx, calls } = mockCtx(['9']);
    await executeImperium(ctx, { service: stubService });
    assert.deepEqual(calls.fails, [IMPERIUM_USAGE]);
    assert.ok(statusBody(stubStatus()).includes('IMPERIUM'));
  });
});
