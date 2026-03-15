import { describe, it, expect, vi } from 'vitest'
import { createServer } from 'http'
import type { AddressInfo } from 'net'
import { handleA2A } from '../src/handler'
import type { Task } from '../src/types'
import { A2A_ERROR_CODES } from '../src/types'

function makeTask(id: string, state: string = 'completed'): Task {
  return {
    id,
    status: {
      state: state as Task['status']['state'],
      message: { role: 'agent', parts: [{ type: 'text', text: 'Done' }] }
    }
  }
}

async function withServer(
  middleware: ReturnType<typeof handleA2A>,
  fn: (baseUrl: string) => Promise<void>
) {
  const server = createServer((req, res) => {
    middleware(req, res, () => {
      res.writeHead(404)
      res.end()
    })
  })

  await new Promise<void>(resolve => server.listen(0, resolve))
  const port = (server.address() as AddressInfo).port
  try {
    await fn(`http://127.0.0.1:${port}`)
  } finally {
    server.close()
  }
}

function rpcBody(method: string, params?: unknown, id: number | string = 1) {
  return JSON.stringify({ jsonrpc: '2.0', id, method, params })
}

async function postRpc(baseUrl: string, body: string) {
  const res = await fetch(baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body
  })
  return res.json()
}

describe('handleA2A', () => {
  it('handles tasks/send', async () => {
    const onSendTask = vi.fn(async params => makeTask(params.id))
    const mw = handleA2A({ onSendTask })

    await withServer(mw, async url => {
      const json = await postRpc(
        url,
        rpcBody('tasks/send', {
          id: 'task-1',
          message: { role: 'user', parts: [{ type: 'text', text: 'Hi' }] }
        })
      )

      expect(json.jsonrpc).toBe('2.0')
      expect(json.result.id).toBe('task-1')
      expect(json.result.status.state).toBe('completed')
      expect(onSendTask).toHaveBeenCalledOnce()
    })
  })

  it('handles tasks/get', async () => {
    const onGetTask = vi.fn(async params => makeTask(params.id))
    const mw = handleA2A({ onSendTask: vi.fn(), onGetTask })

    await withServer(mw, async url => {
      const json = await postRpc(url, rpcBody('tasks/get', { id: 'task-1' }))
      expect(json.result.id).toBe('task-1')
    })
  })

  it('handles tasks/cancel', async () => {
    const onCancelTask = vi.fn(async params => makeTask(params.id, 'canceled'))
    const mw = handleA2A({ onSendTask: vi.fn(), onCancelTask })

    await withServer(mw, async url => {
      const json = await postRpc(url, rpcBody('tasks/cancel', { id: 'task-1' }))
      expect(json.result.status.state).toBe('canceled')
    })
  })

  it('returns error for tasks/get when not implemented', async () => {
    const mw = handleA2A({ onSendTask: vi.fn() })

    await withServer(mw, async url => {
      const json = await postRpc(url, rpcBody('tasks/get', { id: 'task-1' }))
      expect(json.error.code).toBe(A2A_ERROR_CODES.UNSUPPORTED_OPERATION)
    })
  })

  it('returns error for tasks/cancel when not implemented', async () => {
    const mw = handleA2A({ onSendTask: vi.fn() })

    await withServer(mw, async url => {
      const json = await postRpc(url, rpcBody('tasks/cancel', { id: 'task-1' }))
      expect(json.error.code).toBe(A2A_ERROR_CODES.TASK_NOT_CANCELABLE)
    })
  })

  it('returns error for unknown method', async () => {
    const mw = handleA2A({ onSendTask: vi.fn() })

    await withServer(mw, async url => {
      const json = await postRpc(url, rpcBody('tasks/unknown', {}))
      expect(json.error.code).toBe(A2A_ERROR_CODES.METHOD_NOT_FOUND)
    })
  })

  it('returns error for invalid JSON', async () => {
    const mw = handleA2A({ onSendTask: vi.fn() })

    await withServer(mw, async url => {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{broken'
      })
      const json = await res.json()
      expect(json.error.code).toBe(A2A_ERROR_CODES.PARSE_ERROR)
    })
  })

  it('returns error for invalid JSON-RPC request', async () => {
    const mw = handleA2A({ onSendTask: vi.fn() })

    await withServer(mw, async url => {
      const json = await postRpc(url, JSON.stringify({ not: 'valid' }))
      expect(json.error.code).toBe(A2A_ERROR_CODES.INVALID_REQUEST)
    })
  })

  it('returns error when tasks/send missing message', async () => {
    const mw = handleA2A({ onSendTask: vi.fn() })

    await withServer(mw, async url => {
      const json = await postRpc(url, rpcBody('tasks/send', { id: 'x' }))
      expect(json.error.code).toBe(A2A_ERROR_CODES.INVALID_PARAMS)
    })
  })

  it('returns error when tasks/get missing id', async () => {
    const mw = handleA2A({ onSendTask: vi.fn(), onGetTask: vi.fn() })

    await withServer(mw, async url => {
      const json = await postRpc(url, rpcBody('tasks/get', {}))
      expect(json.error.code).toBe(A2A_ERROR_CODES.INVALID_PARAMS)
    })
  })

  it('passes through non-POST requests', async () => {
    const mw = handleA2A({ onSendTask: vi.fn() })

    await withServer(mw, async url => {
      const res = await fetch(url)
      expect(res.status).toBe(404) // hits next()
    })
  })

  it('passes through non-matching paths', async () => {
    const mw = handleA2A({ onSendTask: vi.fn() }, { path: '/a2a' })

    await withServer(mw, async url => {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: rpcBody('tasks/send', {
          id: 'x',
          message: { role: 'user', parts: [] }
        })
      })
      expect(res.status).toBe(404) // path doesn't match
    })
  })

  it('returns internal error when handler throws', async () => {
    const mw = handleA2A({
      onSendTask: async () => {
        throw new Error('boom')
      }
    })

    await withServer(mw, async url => {
      const json = await postRpc(
        url,
        rpcBody('tasks/send', {
          id: 'x',
          message: { role: 'user', parts: [{ type: 'text', text: 'Hi' }] }
        })
      )
      expect(json.error.code).toBe(A2A_ERROR_CODES.INTERNAL_ERROR)
      expect(json.error.message).toBe('boom')
    })
  })
})
