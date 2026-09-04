import { commandRegistry } from '#commands/registry.js';
import { buildContext } from '#messages/context.js';
import { runPipeline } from '#guards/pipeline.js';
import { applyCooldown, clearCooldown } from '#guards/throttles/cooldown.js';
import { groupModel } from '#storage/models/index.js';
import { logger } from '#helpers/logger.js';
import { CommandError } from '#helpers/command-error.js';
import SETTINGS from '#environment/settings.js';

const prefixPattern = () => new RegExp(`^[${escapeRegex(SETTINGS.prefix)}]`);

export async function dispatch(parsed, sock) {
  const { text, fromMe } = parsed;

  if (!text) return;
  if (fromMe && !SETTINGS.respondToSelf) return;
  if (SETTINGS.ignoreBots && parsed.isBot && !parsed.fromMe) return;
  if (!prefixPattern().test(text)) return;

  const withoutPrefix = text.slice(SETTINGS.prefix.length).trim();
  if (!withoutPrefix) return;

  const [commandName] = withoutPrefix.split(/\s+/);
  if (!commandName) return;

  const command = commandRegistry.get(commandName.toLowerCase());
  if (!command) return;

  if (parsed.isGroup && !command.bypassMute) {
    const group = await groupModel.find(parsed.jid);
    if (group?.mute) return;
  }

  const ctx = buildContext(parsed, sock);

  // Command dengan `manualCooldown` menentukan sendiri kapan cooldown dipasang.
  ctx.applyCooldown = () => applyCooldown(ctx, command);
  ctx.clearCooldown = () => clearCooldown(ctx, command);

  try {
    if (!(await runPipeline(ctx, command))) return;

    await ctx.typing();
    await command.execute(ctx);
    if (!command.manualCooldown) await applyCooldown(ctx, command);
  } catch (err) {
    if (err instanceof CommandError) {
      await ctx.reply(err.message).catch(() => {});
      return;
    }
    logger.error(
      { err, command: command.name, sender: ctx.sender },
      'Command error'
    );
    await ctx.reply(`Error: ${err.message}`).catch(() => {});
  }
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
