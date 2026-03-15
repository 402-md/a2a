import type { A2AAgentCard } from '@402md/skillmd'
import type {
  Task,
  Message,
  SendTaskParams,
  GetTaskParams,
  CancelTaskParams,
  JsonRpcRequest,
  JsonRpcResponse,
  PushNotificationConfig
} from './types'

// ── fetchAgentCard ────────────────────────────────────

/**
 * Fetch an A2A Agent Card from a remote agent.
 * Hits `{baseUrl}/.well-known/agent-card.json` and returns the parsed card.
 */
export async function fetchAgentCard(
  baseUrl: string,
  options?: { signal?: AbortSignal }
): Promise<A2AAgentCard> {
  const url = baseUrl.replace(/\/$/, '') + '/.well-known/agent-card.json'
  const res = await fetch(url, { signal: options?.signal })

  if (!res.ok) {
    throw new A2AClientError(
      `Failed to fetch agent card: ${res.status} ${res.statusText}`,
      res.status
    )
  }

  return (await res.json()) as A2AAgentCard
}

// ── A2AClient ─────────────────────────────────────────

export interface A2AClientOptions {
  /** Headers to include in every request (e.g. Authorization) */
  headers?: Record<string, string>
  /** AbortSignal for cancellation */
  signal?: AbortSignal
}

export class A2AClientError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly rpcCode?: number,
    public readonly data?: unknown
  ) {
    super(message)
    this.name = 'A2AClientError'
  }
}

let rpcIdCounter = 0

/**
 * A2A protocol client. Sends JSON-RPC requests to a remote A2A agent.
 *
 * ```typescript
 * const client = new A2AClient('https://agent.example.com')
 * const card = await client.agentCard()
 * const task = await client.sendTask({
 *   message: { role: 'user', parts: [{ type: 'text', text: 'Hello' }] }
 * })
 * ```
 */
export class A2AClient {
  private baseUrl: string
  private headers: Record<string, string>
  private signal?: AbortSignal

  constructor(agentUrl: string, options?: A2AClientOptions) {
    this.baseUrl = agentUrl.replace(/\/$/, '')
    this.headers = {
      'Content-Type': 'application/json',
      ...options?.headers
    }
    this.signal = options?.signal
  }

  /** Fetch the agent's Agent Card */
  async agentCard(): Promise<A2AAgentCard> {
    return fetchAgentCard(this.baseUrl, { signal: this.signal })
  }

  /** Send a task to the agent */
  async sendTask(params: SendTaskParams): Promise<Task>
  async sendTask(message: Message, id?: string): Promise<Task>
  async sendTask(
    paramsOrMessage: SendTaskParams | Message,
    id?: string
  ): Promise<Task> {
    const params: SendTaskParams =
      'role' in paramsOrMessage
        ? { id: id ?? crypto.randomUUID(), message: paramsOrMessage }
        : paramsOrMessage

    return this.rpc<Task>(
      'tasks/send',
      params as unknown as Record<string, unknown>
    )
  }

  /** Get the current status and history of a task */
  async getTask(id: string, historyLength?: number): Promise<Task> {
    const params: GetTaskParams = {
      id,
      ...(historyLength !== undefined ? { historyLength } : {})
    }
    return this.rpc<Task>(
      'tasks/get',
      params as unknown as Record<string, unknown>
    )
  }

  /** Cancel a running task */
  async cancelTask(id: string): Promise<Task> {
    const params: CancelTaskParams = { id }
    return this.rpc<Task>(
      'tasks/cancel',
      params as unknown as Record<string, unknown>
    )
  }

  /**
   * Send a task and subscribe to streaming updates via SSE.
   * Yields TaskStatusUpdateEvent and TaskArtifactUpdateEvent.
   */
  async *sendTaskSubscribe(
    params: SendTaskParams
  ): AsyncGenerator<Record<string, unknown>> {
    const body: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: ++rpcIdCounter,
      method: 'tasks/sendSubscribe',
      params: params as unknown as Record<string, unknown>
    }

    const res = await fetch(this.baseUrl, {
      method: 'POST',
      headers: { ...this.headers, Accept: 'text/event-stream' },
      body: JSON.stringify(body),
      signal: this.signal
    })

    if (!res.ok) {
      throw new A2AClientError(
        `SSE request failed: ${res.status} ${res.statusText}`,
        res.status
      )
    }

    if (!res.body) {
      throw new A2AClientError(
        'Response body is null — streaming not supported'
      )
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        let currentData = ''
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            currentData += line.slice(6)
          } else if (line === '' && currentData) {
            try {
              yield JSON.parse(currentData)
            } catch {
              // skip malformed events
            }
            currentData = ''
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  }

  /**
   * Set push notification config for a task.
   */
  async setPushNotification(
    taskId: string,
    config: PushNotificationConfig
  ): Promise<PushNotificationConfig> {
    return this.rpc<PushNotificationConfig>('tasks/pushNotification/set', {
      id: taskId,
      pushNotificationConfig: config
    })
  }

  /**
   * Get push notification config for a task.
   */
  async getPushNotification(taskId: string): Promise<PushNotificationConfig> {
    return this.rpc<PushNotificationConfig>('tasks/pushNotification/get', {
      id: taskId
    })
  }

  // ── Internal ──────────────────────────────────────────

  private async rpc<T>(
    method: string,
    params: Record<string, unknown>
  ): Promise<T> {
    const body: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: ++rpcIdCounter,
      method,
      params
    }

    const res = await fetch(this.baseUrl, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
      signal: this.signal
    })

    if (!res.ok) {
      throw new A2AClientError(
        `HTTP ${res.status}: ${res.statusText}`,
        res.status
      )
    }

    const json = (await res.json()) as JsonRpcResponse

    if (json.error) {
      throw new A2AClientError(
        json.error.message,
        undefined,
        json.error.code,
        json.error.data
      )
    }

    return json.result as T
  }
}
