import { describe, it, expect } from 'vitest'
import { createServer } from 'http'
import type { AddressInfo } from 'net'
import { serveAgentCard } from '../src/serve'
import type { A2AAgentCard } from '@402md/skillmd'

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

async function withServer(
  middleware: ReturnType<typeof serveAgentCard>,
  fn: (baseUrl: string) => Promise<void>
) {
  const server = createServer((req, res) => {
    middleware(req, res, () => {
      res.writeHead(404)
      res.end('Not found')
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

describe('serveAgentCard', () => {
  it('serves card at /.well-known/agent-card.json', async () => {
    const mw = serveAgentCard({ card: mockCard })

    await withServer(mw, async url => {
      const res = await fetch(`${url}/.well-known/agent-card.json`)
      expect(res.status).toBe(200)

      const body = await res.json()
      expect(body.name).toBe('Test Agent')
      expect(body.schemaVersion).toBe('1.0')
    })
  })

  it('sets Content-Type to application/json', async () => {
    const mw = serveAgentCard({ card: mockCard })

    await withServer(mw, async url => {
      const res = await fetch(`${url}/.well-known/agent-card.json`)
      expect(res.headers.get('Content-Type')).toBe('application/json')
    })
  })

  it('sets Cache-Control with default maxAge', async () => {
    const mw = serveAgentCard({ card: mockCard })

    await withServer(mw, async url => {
      const res = await fetch(`${url}/.well-known/agent-card.json`)
      expect(res.headers.get('Cache-Control')).toBe('public, max-age=3600')
    })
  })

  it('respects custom maxAge', async () => {
    const mw = serveAgentCard({ card: mockCard, maxAge: 60 })

    await withServer(mw, async url => {
      const res = await fetch(`${url}/.well-known/agent-card.json`)
      expect(res.headers.get('Cache-Control')).toBe('public, max-age=60')
    })
  })

  it('passes through non-matching paths', async () => {
    const mw = serveAgentCard({ card: mockCard })

    await withServer(mw, async url => {
      const res = await fetch(`${url}/other-path`)
      expect(res.status).toBe(404)
    })
  })

  it('ignores query params when matching path', async () => {
    const mw = serveAgentCard({ card: mockCard })

    await withServer(mw, async url => {
      const res = await fetch(`${url}/.well-known/agent-card.json?foo=bar`)
      expect(res.status).toBe(200)
    })
  })
})
