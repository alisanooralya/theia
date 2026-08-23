import { cooldownModel } from '#storage/models/index.js'
import { F } from '#helpers/index.js'
import { COOLDOWN_DEFAULT } from '#environment/limits.js'

export function checkCooldown(ctx, command) {
  const ms = command.cooldown ?? COOLDOWN_DEFAULT
  if (ms <= 0) return true

  const remaining = cooldownModel.check(ctx.sender, command.name)
  if (remaining > 0) {
    ctx.reply(`Tunggu ${F.formatDuration(remaining)} sebelum pakai \`${command.name}\` lagi.`)
    return false
  }

  return true
}

export function applyCooldown(ctx, command) {
  const ms = command.cooldown ?? COOLDOWN_DEFAULT
  if (ms <= 0) return
  cooldownModel.set(ctx.sender, command.name, ms)
}
