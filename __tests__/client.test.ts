import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchAgentCard, A2AClient, A2AClientError } from '../src/client'

const mockCard = {
  schemaVersion: '1.0',
  humanReadableId: 'test/agent',
  name: 'Test Agent',
  description: 'Test',
  url: 'https://agent.example.com',
  protocolVersion: '0.3.0',
  preferredTransport: 'REST',
  provider: { name: 'Test' },
  capabilities: { a2aVersion: '0.3.0' },
  authSchemes: [{ scheme: 'x402' }]
}

const mockTask = {
  id: 'task-1',
  status: {
    state: 'completed',
    message: { role: 'agent', parts: [{ type: 'text', text: 'Done' }] }
  }
}

const originalFetch = globalThis.fetch

beforeEach(() => {
  globalThis.fetch = vi.fn()
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

function mockFetchJson(data: unknown, status = 200) {
  ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
    new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' }
    })
  )
}

function mockFetchRpc(result: unknown) {
  mockFetchJson({ jsonrpc: '2.0', id: 1, result })
}

function mockFetchRpcError(code: number, message: string) {
  mockFetchJson({ jsonrpc: '2.0', id: 1, error: { code, message } })
}

describe('fetchAgentCard', () => {
  it('fetches card from /.well-known/agent-card.json', async () => {
    mockFetchJson(mockCard)
    const card = await fetchAgentCard('https://agent.example.com')

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://agent.example.com/.well-known/agent-card.json',
      { signal: undefined }
    )
    expect(card.name).toBe('Test Agent')
  })

  it('strips trailing slash from base URL', async () => {
    mockFetchJson(mockCard)
    await fetchAgentCard('https://agent.example.com/')

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://agent.example.com/.well-known/agent-card.json',
      { signal: undefined }
    )
  })

  it('throws A2AClientError on non-OK response', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response('Not Found', { status: 404, statusText: 'Not Found' })
    )

    await expect(fetchAgentCard('https://agent.example.com')).rejects.toThrow(
      A2AClientError
    )
  })

  it('includes status code in error', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response('Error', { status: 500, statusText: 'Server Error' })
    )

    try {
      await fetchAgentCard('https://agent.example.com')
    } catch (err) {
      expect(err).toBeInstanceOf(A2AClientError)
      expect((err as A2AClientError).statusCode).toBe(500)
    }
  })
})

describe('A2AClient', () => {
  it('sends tasks/send with full params', async () => {
    mockFetchRpc(mockTask)
    const client = new A2AClient('https://agent.example.com')

    const task = await client.sendTask({
      id: 'task-1',
      message: { role: 'user', parts: [{ type: 'text', text: 'Hi' }] }
    })

    expect(task.id).toBe('task-1')
    expect(task.status.state).toBe('completed')

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    const body = JSON.parse(call[1].body)
    expect(body.method).toBe('tasks/send')
    expect(body.jsonrpc).toBe('2.0')
  })

  it('sends tasks/send with message shorthand', async () => {
    mockFetchRpc(mockTask)
    const client = new A2AClient('https://agent.example.com')

    await client.sendTask(
      { role: 'user', parts: [{ type: 'text', text: 'Hi' }] },
      'my-task'
    )

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    const body = JSON.parse(call[1].body)
    expect(body.params.id).toBe('my-task')
    expect(body.params.message.role).toBe('user')
  })

  it('sends tasks/get', async () => {
    mockFetchRpc(mockTask)
    const client = new A2AClient('https://agent.example.com')

    const task = await client.getTask('task-1')
    expect(task.id).toBe('task-1')

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    const body = JSON.parse(call[1].body)
    expect(body.method).toBe('tasks/get')
    expect(body.params.id).toBe('task-1')
  })

  it('sends tasks/get with historyLength', async () => {
    mockFetchRpc(mockTask)
    const client = new A2AClient('https://agent.example.com')

    await client.getTask('task-1', 5)

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    const body = JSON.parse(call[1].body)
    expect(body.params.historyLength).toBe(5)
  })

  it('sends tasks/cancel', async () => {
    mockFetchRpc({ ...mockTask, status: { state: 'canceled' } })
    const client = new A2AClient('https://agent.example.com')

    const task = await client.cancelTask('task-1')
    expect(task.status.state).toBe('canceled')

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    const body = JSON.parse(call[1].body)
    expect(body.method).toBe('tasks/cancel')
  })

  it('includes custom headers', async () => {
    mockFetchRpc(mockTask)
    const client = new A2AClient('https://agent.example.com', {
      headers: { Authorization: 'Bearer token123' }
    })

    await client.sendTask({
      id: 'x',
      message: { role: 'user', parts: [{ type: 'text', text: 'Hi' }] }
    })

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(call[1].headers.Authorization).toBe('Bearer token123')
  })

  it('throws A2AClientError on HTTP error', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response('Error', { status: 502, statusText: 'Bad Gateway' })
    )

    const client = new A2AClient('https://agent.example.com')
    await expect(
      client.sendTask({ id: 'x', message: { role: 'user', parts: [] } })
    ).rejects.toThrow(A2AClientError)
  })

  it('throws A2AClientError on JSON-RPC error', async () => {
    mockFetchRpcError(-32001, 'Task not found')
    const client = new A2AClient('https://agent.example.com')

    try {
      await client.getTask('nonexistent')
    } catch (err) {
      expect(err).toBeInstanceOf(A2AClientError)
      expect((err as A2AClientError).rpcCode).toBe(-32001)
      expect((err as A2AClientError).message).toBe('Task not found')
    }
  })

  it('strips trailing slash from agent URL', async () => {
    mockFetchRpc(mockTask)
    const client = new A2AClient('https://agent.example.com/')

    await client.sendTask({
      id: 'x',
      message: { role: 'user', parts: [{ type: 'text', text: 'Hi' }] }
    })

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(call[0]).toBe('https://agent.example.com')
  })
})
