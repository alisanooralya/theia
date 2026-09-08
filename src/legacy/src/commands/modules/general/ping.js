import axios from 'axios';

export default {
  name: 'ping',
  aliases: ['p', 'latency'],
  category: 'general',
  description: 'Cek response time bot',
  cooldown: 5_000,

  async execute(ctx) {
    const perf = Date.now();
    await axios.request('https://google.com');
    const perfm = Date.now();
    const speed = (perfm - perf).toFixed(2);

    await ctx.reply(`🏓 *Pong!* ${speed} ms`);
  },
};
