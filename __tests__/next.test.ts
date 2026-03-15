import { describe, it, expect, vi } from 'vitest'
import { agentCardResponse, handleA2ANext } from '../src/next'
import type { A2AAgentCard } from '@402md/skillmd'
import type { Task } from '../src/types'
import { A2A_ERROR_CODES } from '../src/types'

const mockCard: A2AAgentCard = {
  schemaVersion: '1.0',
  humanReadableId: 'test/agent',
  agentVersion: '1.0.0',
  name: 'Test Agent',
  description: 'A test agent',
  url: 'https://test.example.com',
  protocolVersion: '0.3.0',
  preferredTransport: 'REST',
  provider: { name: 'Test' },
  capabilities: { a2aVersion: '0.3.0' },
  authSchemes: [{ scheme: 'x402' }]
}

function makeTask(id: string, state: string = 'completed'): Task {
  return {
    id,
    status: {
      state: state as Task['status']['state'],
      message: { role: 'agent', parts: [{ type: 'text', text: 'Done' }] }
    }
  }
}

function rpcRequest(method: string, params?: unknown, id: number = 1): Request {
  return new Request('http://localhost/a2a', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params })
  })
}

describe('agentCardResponse', () => {
  it('returns the card as JSON', async () => {
    const handler = agentCardResponse({ card: mockCard })
    const res = handler(new Request('http://localhost'))

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/json')

    const body = await res.json()
    expect(body.name).toBe('Test Agent')
    expect(body.schemaVersion).toBe('1.0')
  })

  it('sets Cache-Control header', async () => {
    const handler = agentCardResponse({ card: mockCard, maxAge: 7200 })
    const res = handler(new Request('http://localhost'))

    expect(res.headers.get('Cache-Control')).toBe('public, max-age=7200')
  })

  it('defaults maxAge to 3600', async () => {
    const handler = agentCardResponse({ card: mockCard })
    const res = handler(new Request('http://localhost'))

    expect(res.headers.get('Cache-Control')).toBe('public, max-age=3600')
  })

  it('caches the JSON (returns same content on multiple calls)', async () => {
    const handler = agentCardResponse({ card: mockCard })
    const res1 = await handler(new Request('http://localhost')).text()
    const res2 = await handler(new Request('http://localhost')).text()

    expect(res1).toBe(res2)
  })
})

describe('handleA2ANext', () => {
  it('handles tasks/send', async () => {
    const onSendTask = vi.fn(async params => makeTask(params.id))
    const handler = handleA2ANext({ onSendTask })

    const res = await handler(
      rpcRequest('tasks/send', {
        id: 'task-1',
        message: { role: 'user', parts: [{ type: 'text', text: 'Hello' }] }
      })
    )

    const json = await res.json()
    expect(json.result.id).toBe('task-1')
    expect(json.result.status.state).toBe('completed')
  })

  it('handles tasks/get', async () => {
    const handler = handleA2ANext({
      onSendTask: vi.fn(),
      onGetTask: vi.fn(async params => makeTask(params.id))
    })

    const res = await handler(rpcRequest('tasks/get', { id: 'task-1' }))
    const json = await res.json()
    expect(json.result.id).toBe('task-1')
  })

  it('handles tasks/cancel', async () => {
    const handler = handleA2ANext({
      onSendTask: vi.fn(),
      onCancelTask: vi.fn(async params => makeTask(params.id, 'canceled'))
    })

    const res = await handler(rpcRequest('tasks/cancel', { id: 'task-1' }))
    const json = await res.json()
    expect(json.result.status.state).toBe('canceled')
  })

  it('returns error for invalid JSON', async () => {
    const handler = handleA2ANext({ onSendTask: vi.fn() })
    const req = new Request('http://localhost', {
      method: 'POST',
      body: '{broken'
    })

    const res = await handler(req)
    const json = await res.json()
    expect(json.error.code).toBe(A2A_ERROR_CODES.PARSE_ERROR)
  })

  it('returns error for invalid JSON-RPC', async () => {
    const handler = handleA2ANext({ onSendTask: vi.fn() })
    const req = new Request('http://localhost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ foo: 'bar' })
    })

    const res = await handler(req)
    const json = await res.json()
    expect(json.error.code).toBe(A2A_ERROR_CODES.INVALID_REQUEST)
  })

  it('returns error for unknown method', async () => {
    const handler = handleA2ANext({ onSendTask: vi.fn() })
    const res = await handler(rpcRequest('tasks/unknown', {}))
    const json = await res.json()
    expect(json.error.code).toBe(A2A_ERROR_CODES.METHOD_NOT_FOUND)
  })

  it('returns error when tasks/get not implemented', async () => {
    const handler = handleA2ANext({ onSendTask: vi.fn() })
    const res = await handler(rpcRequest('tasks/get', { id: 'x' }))
    const json = await res.json()
    expect(json.error.code).toBe(A2A_ERROR_CODES.UNSUPPORTED_OPERATION)
  })

  it('returns error when tasks/cancel not implemented', async () => {
    const handler = handleA2ANext({ onSendTask: vi.fn() })
    const res = await handler(rpcRequest('tasks/cancel', { id: 'x' }))
    const json = await res.json()
    expect(json.error.code).toBe(A2A_ERROR_CODES.TASK_NOT_CANCELABLE)
  })

  it('returns error when tasks/send missing message', async () => {
    const handler = handleA2ANext({ onSendTask: vi.fn() })
    const res = await handler(rpcRequest('tasks/send', { id: 'x' }))
    const json = await res.json()
    expect(json.error.code).toBe(A2A_ERROR_CODES.INVALID_PARAMS)
  })

  it('returns internal error when handler throws', async () => {
    const handler = handleA2ANext({
      onSendTask: async () => {
        throw new Error('kaboom')
      }
    })

    const res = await handler(
      rpcRequest('tasks/send', {
        id: 'x',
        message: { role: 'user', parts: [{ type: 'text', text: 'Hi' }] }
      })
    )

    const json = await res.json()
    expect(json.error.code).toBe(A2A_ERROR_CODES.INTERNAL_ERROR)
    expect(json.error.message).toBe('kaboom')
  })
})
