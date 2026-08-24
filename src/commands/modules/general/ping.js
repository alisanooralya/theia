import axios from 'axios';

export default {
  name: 'ping',
  aliases: ['p', 'latency'],
  category: 'general',
  description: 'Cek response time bot',
  cooldown: 5_000,

  async execute(ctx) {
    let perf = Date.now();
    await axios.request('https://google.com');

    let perfm = Date.now();
    let speed = ((perfm - perf) / 1000).toFixed(2);
    ctx.reply(`🏓 *Pong!* ${speed} ms`);
  },
};
