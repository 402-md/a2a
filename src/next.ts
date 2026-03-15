import { readFileSync } from 'fs'
import { parseSkillMd, toAgentCard } from '@402md/skillmd'
import type { A2AAgentCard } from '@402md/skillmd'
import type {
  SendTaskParams,
  GetTaskParams,
  CancelTaskParams,
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcError
} from './types'
import { A2A_ERROR_CODES } from './types'
import type { ServeAgentCardOptions } from './serve'
import type { A2AHandlers } from './handler'

// ── Types ─────────────────────────────────────────────

type NextRouteHandler = (request: Request) => Response | Promise<Response>

// ── Helpers ───────────────────────────────────────────

function jsonResponse(
  body: unknown,
  status: number = 200,
  headers: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers }
  })
}

function rpcResponse(
  id: string | number,
  result?: unknown,
  error?: JsonRpcError
): Response {
  const body: JsonRpcResponse = { jsonrpc: '2.0', id }
  if (error) body.error = error
  else body.result = result
  return jsonResponse(body)
}

function rpcError(code: number, message: string, data?: unknown): JsonRpcError {
  return { code, message, ...(data !== undefined ? { data } : {}) }
}

function buildCard(options: ServeAgentCardOptions): A2AAgentCard {
  if (options.card) return options.card

  const skillMdPath = options.skillMdPath ?? './SKILL.md'
  const raw = readFileSync(skillMdPath, 'utf-8')
  const manifest = parseSkillMd(raw)
  return toAgentCard(manifest, options)
}

// ── Agent Card Route Handler ──────────────────────────

/**
 * Next.js App Router handler that serves an A2A Agent Card.
 *
 * Usage in `app/.well-known/agent-card.json/route.ts`:
 * ```typescript
 * import { agentCardResponse } from '@402md/a2a'
 * export const GET = agentCardResponse()
 * ```
 */
export function agentCardResponse(
  options?: ServeAgentCardOptions | string
): NextRouteHandler {
  const opts: ServeAgentCardOptions =
    typeof options === 'string' ? { skillMdPath: options } : (options ?? {})

  const card = buildCard(opts)
  const json = JSON.stringify(card)
  const maxAge = opts.maxAge ?? 3600

  return () => {
    return new Response(json, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${maxAge}`
      }
    })
  }
}

// ── A2A Handler Route ─────────────────────────────────

/**
 * Next.js App Router handler for A2A JSON-RPC requests.
 *
 * Usage in `app/a2a/route.ts`:
 * ```typescript
 * import { handleA2ANext } from '@402md/a2a'
 *
 * export const POST = handleA2ANext({
 *   onSendTask: async (params) => ({
 *     id: params.id,
 *     status: { state: 'completed', message: {
 *       role: 'agent',
 *       parts: [{ type: 'text', text: 'Done!' }]
 *     }}
 *   })
 * })
 * ```
 */
export function handleA2ANext(handlers: A2AHandlers): NextRouteHandler {
  return async (request: Request) => {
    let body: string
    try {
      body = await request.text()
    } catch {
      return rpcResponse(
        0,
        undefined,
        rpcError(A2A_ERROR_CODES.PARSE_ERROR, 'Failed to read request body')
      )
    }

    let rpcRequest: JsonRpcRequest
    try {
      rpcRequest = JSON.parse(body)
    } catch {
      return rpcResponse(
        0,
        undefined,
        rpcError(A2A_ERROR_CODES.PARSE_ERROR, 'Invalid JSON')
      )
    }

    if (rpcRequest.jsonrpc !== '2.0' || !rpcRequest.method || !rpcRequest.id) {
      return rpcResponse(
        rpcRequest?.id ?? 0,
        undefined,
        rpcError(
          A2A_ERROR_CODES.INVALID_REQUEST,
          'Invalid JSON-RPC 2.0 request'
        )
      )
    }

    try {
      switch (rpcRequest.method) {
        case 'tasks/send': {
          const params = rpcRequest.params as unknown as SendTaskParams
          if (!params?.message) {
            return rpcResponse(
              rpcRequest.id,
              undefined,
              rpcError(
                A2A_ERROR_CODES.INVALID_PARAMS,
                'Missing required "message" in params'
              )
            )
          }
          if (!params.id) {
            params.id = crypto.randomUUID()
          }
          const task = await handlers.onSendTask(params)
          return rpcResponse(rpcRequest.id, task)
        }

        case 'tasks/get': {
          if (!handlers.onGetTask) {
            return rpcResponse(
              rpcRequest.id,
              undefined,
              rpcError(
                A2A_ERROR_CODES.UNSUPPORTED_OPERATION,
                'tasks/get is not supported'
              )
            )
          }
          const params = rpcRequest.params as unknown as GetTaskParams
          if (!params?.id) {
            return rpcResponse(
              rpcRequest.id,
              undefined,
              rpcError(
                A2A_ERROR_CODES.INVALID_PARAMS,
                'Missing required "id" in params'
              )
            )
          }
          const task = await handlers.onGetTask(params)
          return rpcResponse(rpcRequest.id, task)
        }

        case 'tasks/cancel': {
          if (!handlers.onCancelTask) {
            return rpcResponse(
              rpcRequest.id,
              undefined,
              rpcError(
                A2A_ERROR_CODES.TASK_NOT_CANCELABLE,
                'tasks/cancel is not supported'
              )
            )
          }
          const params = rpcRequest.params as unknown as CancelTaskParams
          if (!params?.id) {
            return rpcResponse(
              rpcRequest.id,
              undefined,
              rpcError(
                A2A_ERROR_CODES.INVALID_PARAMS,
                'Missing required "id" in params'
              )
            )
          }
          const task = await handlers.onCancelTask(params)
          return rpcResponse(rpcRequest.id, task)
        }

        default:
          return rpcResponse(
            rpcRequest.id,
            undefined,
            rpcError(
              A2A_ERROR_CODES.METHOD_NOT_FOUND,
              `Unknown method: "${rpcRequest.method}"`
            )
          )
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal error'
      return rpcResponse(
        rpcRequest.id,
        undefined,
        rpcError(A2A_ERROR_CODES.INTERNAL_ERROR, message)
      )
    }
  }
}
