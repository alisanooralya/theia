/**
 * Permission levels for AI Agent tools.
 *
 * Enforcement is ALWAYS server-side (JavaScript), never prompt-only:
 * - the tool registry stores a `permission` level per tool,
 * - the agent loop checks the caller's resolved level before every tool call,
 * - owner tools additionally assert `ctx.isOwner` inside `execute()` (defense in depth).
 */

export const LEVELS = Object.freeze({
  user: 0,
  premium: 1,
  owner: 2,
})

/**
 * Resolve the caller's permission level from their authenticated context.
 * @param {{ isOwner: boolean, isPremium: boolean }} caller
 * @returns {'user'|'premium'|'owner'}
 */
export function resolveLevel(caller) {
  if (caller?.isOwner) return 'owner'
  if (caller?.isPremium) return 'premium'
  return 'user'
}

/**
 * Can a caller with `level` invoke a tool that requires `tool.permission`?
 */
export function canUseTool(level, tool) {
  const required = tool?.permission ?? 'user'
  return (LEVELS[level] ?? 0) >= (LEVELS[required] ?? 0)
}

export class PermissionDeniedError extends Error {
  constructor(toolName) {
    super(`Akses ditolak: tool '${toolName}' memerlukan permission lebih tinggi.`)
    this.name = 'PermissionDeniedError'
    this.toolName = toolName
  }
}