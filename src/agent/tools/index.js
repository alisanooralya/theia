/**
 * Tool registry for the AI Agent.
 *
 * Every tool MUST have:
 *   name, description, parameters (JSON Schema, root must be an object),
 *   permission ('user' | 'premium' | 'owner'), async execute(args, agentCtx).
 *
 * Permission enforcement happens here + in the agent loop (server-side).
 * The AI can only see tool schemas — it never executes anything directly.
 */
import { userTools } from './user.js'
import { economyTools } from './economy.js'
import { downloaderTools } from './downloader.js'
import { ownerTools } from './owner.js'

class ToolRegistry {
  _tools = new Map()

  register(tool) {
    if (!tool?.name || !tool?.description || !tool?.parameters || typeof tool.execute !== 'function') {
      throw new Error(`Tool tidak valid: ${tool?.name ?? '(unnamed)'}`)
    }
    if (this._tools.has(tool.name)) throw new Error(`Tool duplikat: ${tool.name}`)
    this._tools.set(tool.name, { permission: 'user', ...tool })
  }

  get(name) { return this._tools.get(name) ?? null }
  list() { return [...this._tools.values()] }
  count() { return this._tools.size }

  /** OpenAI-style schemas sent to the model. */
  schemas() {
    return [...this._tools.values()].map(t => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }))
  }
}

export const toolRegistry = new ToolRegistry()

for (const tool of [...userTools, ...economyTools, ...downloaderTools, ...ownerTools]) {
  toolRegistry.register(tool)
}