import { readFileSync } from 'fs'
import type { IncomingMessage, ServerResponse } from 'http'
import { parseSkillMd, toAgentCard } from '@402md/skillmd'
import type { A2AAgentCard, ToAgentCardOptions } from '@402md/skillmd'

export interface ServeAgentCardOptions extends ToAgentCardOptions {
  /** Path to the SKILL.md file (default: './SKILL.md') */
  skillMdPath?: string
  /** Pre-built card — skips file reading and conversion */
  card?: A2AAgentCard
  /** Cache-Control max-age in seconds (default: 3600) */
  maxAge?: number
}

type Middleware = (
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void
) => void

type HonoMiddleware = (
  c: {
    req: { path: string }
    json: (data: unknown) => unknown
    header: (name: string, value: string) => void
  },
  next: () => Promise<void>
) => Promise<unknown>

const WELL_KNOWN_PATH = '/.well-known/agent-card.json'

function buildCardJson(options: ServeAgentCardOptions): string {
  if (options.card) {
    return JSON.stringify(options.card)
  }

  const skillMdPath = options.skillMdPath ?? './SKILL.md'
  const raw = readFileSync(skillMdPath, 'utf-8')
  const manifest = parseSkillMd(raw)
  const card = toAgentCard(manifest, options)
  return JSON.stringify(card)
}

/**
 * Express/Connect/Node.js middleware that serves an A2A Agent Card
 * at `/.well-known/agent-card.json`.
 *
 * @param options - Config options or a string path to SKILL.md
 */
export function serveAgentCard(
  options?: ServeAgentCardOptions | string
): Middleware {
  const opts: ServeAgentCardOptions =
    typeof options === 'string' ? { skillMdPath: options } : (options ?? {})

  const json = buildCardJson(opts)
  const maxAge = opts.maxAge ?? 3600

  return (req, res, next) => {
    const url = req.url?.split('?')[0]
    if (url !== WELL_KNOWN_PATH) {
      next()
      return
    }

    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${maxAge}`
    })
    res.end(json)
  }
}

/**
 * Hono middleware that serves an A2A Agent Card
 * at `/.well-known/agent-card.json`.
 *
 * @param options - Config options or a string path to SKILL.md
 */
export function serveAgentCardHono(
  options?: ServeAgentCardOptions | string
): HonoMiddleware {
  const opts: ServeAgentCardOptions =
    typeof options === 'string' ? { skillMdPath: options } : (options ?? {})

  const json = buildCardJson(opts)
  const card = JSON.parse(json)
  const maxAge = opts.maxAge ?? 3600

  return async (c, next) => {
    if (c.req.path !== WELL_KNOWN_PATH) {
      await next()
      return
    }

    c.header('Cache-Control', `public, max-age=${maxAge}`)
    return c.json(card)
  }
}
