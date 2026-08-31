import { sql } from '#storage/connection.js';

export default {
  name: 'tools',
  aliases: ['tool', 'admin'],
  category: 'owner',
  description: 'Tools admin (db query, dll)',
  cooldown: 0,
  ownerOnly: true,

  async execute(ctx) {
    const sub = ctx.args[0]?.toLowerCase();

    if (sub === 'db' || sub === 'query') {
      const query = ctx.rawArgs.replace(/^(db|query)\s+/i, '');
      if (!query) ctx.fail('Usage: `!tools db <query>`');
      try {
        const isSelect = query.trim().toUpperCase().startsWith('SELECT');
        const rows = await sql.unsafe(query);
        await ctx.reply(
          `✅ Query OK:\n\`\`\`\n${JSON.stringify(
            isSelect ? rows : { changes: rows.count ?? rows.length },
            null,
            2
          ).slice(0, 3000)}\n\`\`\``
        );
      } catch (err) {
        await ctx.reply(`❌ ${err.message}`);
      }
      return;
    }

    ctx.fail('Usage: `!tools db <query>`');
  },
};
