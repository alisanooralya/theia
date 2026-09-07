/**
 * Test render banner gacha.
 * Cara pakai: node test-banner.js [girgas|lena|ameris|daisy]
 * Output: temp/banner-test.png
 */
import { writeFile } from 'node:fs/promises';
import { renderGachaBanner } from './src/features/rpg/gacha-banner.js';
import { cardArtPath } from './src/features/rpg/card-config.js';

const CARDS = {
  girgas: { name: 'Girgas', subtitle: 'Attacker' },
  lena: { name: 'Lena', subtitle: 'Archer' },
  ameris: { name: 'Ameris', subtitle: 'Supporter' },
  daisy: { name: 'Daisy', subtitle: 'Defender' },
};

const picked = String(process.argv[2] ?? 'girgas').toLowerCase();
const card = CARDS[picked] ?? CARDS.girgas;

const buffer = await renderGachaBanner({
  name: card.name,
  subtitle: card.subtitle,
  eraLabel: 'MYSTIC VIOLET',
  rateUpText: 'RATE UP  ·  1%',
  description:
    'Pull untuk mendapatkan Main Card dan Support Card. Rate card 1%, artifact 8%.',
  artPath: cardArtPath(picked in CARDS ? picked : 'girgas'),
});

const out = 'temp/banner-test.png';
await writeFile(out, buffer);
console.log(`Saved: ${out} (${buffer.length} bytes)`);
