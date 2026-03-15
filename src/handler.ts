import type { IncomingMessage, ServerResponse } from 'http'
import type {
  Task,
  SendTaskParams,
  GetTaskParams,
  CancelTaskParams,
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcError
} from './types'
import { A2A_ERROR_CODES } from './types'

// ── Handler interface ─────────────────────────────────

export interface A2AHandlers {
  /** Handle an incoming task — required */
  onSendTask: (params: SendTaskParams) => Promise<Task>
  /** Return task status/history — optional (returns -32001 if not implemented) */
  onGetTask?: (params: GetTaskParams) => Promise<Task>
  /** Cancel a running task — optional (returns -32002 if not implemented) */
  onCancelTask?: (params: CancelTaskParams) => Promise<Task>
}

export interface HandleA2AOptions {
  /** Path to listen on (default: '/') */
  path?: string
}

type Middleware = (
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void
) => void

// ── Helpers ───────────────────────────────────────────

function sendJsonRpc(
  res: ServerResponse,
  id: string | number,
  result?: unknown,
  error?: JsonRpcError
): void {
  const body: JsonRpcResponse = { jsonrpc: '2.0', id }
  if (error) body.error = error
  else body.result = result

  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

function rpcError(code: number, message: string, data?: unknown): JsonRpcError {
  return { code, message, ...(data !== undefined ? { data } : {}) }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString()))
    req.on('error', reject)
  })
}

// ── Middleware ─────────────────────────────────────────

/**
 * Express/Connect middleware that handles A2A JSON-RPC requests.
 *
 * Supports `tasks/send`, `tasks/get`, and `tasks/cancel`.
 *
 * ```typescript
 * app.use(handleA2A({
 *   onSendTask: async (params) => {
 *     // process the task...
 *     return {
 *       id: params.id,
 *       status: { state: 'completed', message: { role: 'agent', parts: [{ type: 'text', text: 'Done!' }] } }
 *     }
 *   }
 * }))
 * ```
 */
export function handleA2A(
  handlers: A2AHandlers,
  options?: HandleA2AOptions
): Middleware {
  const targetPath = options?.path ?? '/'

  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  return async (req, res, next) => {
    // Only handle POST to the target path
    const url = req.url?.split('?')[0]
    if (req.method !== 'POST' || url !== targetPath) {
      next()
      return
    }

    let body: string
    try {
      body = await readBody(req)
    } catch {
      sendJsonRpc(
        res,
        0,
        undefined,
        rpcError(A2A_ERROR_CODES.PARSE_ERROR, 'Failed to read request body')
      )
      return
    }

    let request: JsonRpcRequest
    try {
      request = JSON.parse(body)
    } catch {
      sendJsonRpc(
        res,
        0,
        undefined,
        rpcError(A2A_ERROR_CODES.PARSE_ERROR, 'Invalid JSON')
      )
      return
    }

    if (request.jsonrpc !== '2.0' || !request.method || !request.id) {
      sendJsonRpc(
        res,
        request?.id ?? 0,
        undefined,
        rpcError(
          A2A_ERROR_CODES.INVALID_REQUEST,
          'Invalid JSON-RPC 2.0 request'
        )
      )
      return
    }

    try {
      switch (request.method) {
        case 'tasks/send': {
          const params = request.params as unknown as SendTaskParams
          if (!params?.message) {
            sendJsonRpc(
              res,
              request.id,
              undefined,
              rpcError(
                A2A_ERROR_CODES.INVALID_PARAMS,
                'Missing required "message" in params'
              )
            )
            return
          }
          if (!params.id) {
            params.id = crypto.randomUUID()
          }
          const task = await handlers.onSendTask(params)
          sendJsonRpc(res, request.id, task)
          return
        }

        case 'tasks/get': {
          if (!handlers.onGetTask) {
            sendJsonRpc(
              res,
              request.id,
              undefined,
              rpcError(
                A2A_ERROR_CODES.UNSUPPORTED_OPERATION,
                'tasks/get is not supported'
              )
            )
            return
          }
          const params = request.params as unknown as GetTaskParams
          if (!params?.id) {
            sendJsonRpc(
              res,
              request.id,
              undefined,
              rpcError(
                A2A_ERROR_CODES.INVALID_PARAMS,
                'Missing required "id" in params'
              )
            )
            return
          }
          const task = await handlers.onGetTask(params)
          sendJsonRpc(res, request.id, task)
          return
        }

        case 'tasks/cancel': {
          if (!handlers.onCancelTask) {
            sendJsonRpc(
              res,
              request.id,
              undefined,
              rpcError(
                A2A_ERROR_CODES.TASK_NOT_CANCELABLE,
                'tasks/cancel is not supported'
              )
            )
            return
          }
          const params = request.params as unknown as CancelTaskParams
          if (!params?.id) {
            sendJsonRpc(
              res,
              request.id,
              undefined,
              rpcError(
                A2A_ERROR_CODES.INVALID_PARAMS,
                'Missing required "id" in params'
              )
            )
            return
          }
          const task = await handlers.onCancelTask(params)
          sendJsonRpc(res, request.id, task)
          return
        }

        default:
          sendJsonRpc(
            res,
            request.id,
            undefined,
            rpcError(
              A2A_ERROR_CODES.METHOD_NOT_FOUND,
              `Unknown method: "${request.method}"`
            )
          )
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal error'
      sendJsonRpc(
        res,
        request.id,
        undefined,
        rpcError(A2A_ERROR_CODES.INTERNAL_ERROR, message)
      )
    }
  }
}
