import { describe, it, expect } from 'vitest'
import { validateAgentCard } from '../src/validate'

function makeValidCard(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    schemaVersion: '1.0',
    humanReadableId: 'acme/weather',
    agentVersion: '1.0.0',
    name: 'Weather Agent',
    description: 'Real-time weather',
    url: 'https://agent.example.com',
    protocolVersion: '0.3.0',
    preferredTransport: 'REST',
    provider: { name: 'Acme Corp' },
    capabilities: { a2aVersion: '0.3.0' },
    authSchemes: [{ scheme: 'x402' }],
    skills: [
      { id: 'weather_v1', name: 'Get weather', description: 'Current weather' }
    ],
    ...overrides
  }
}

describe('validateAgentCard', () => {
  it('validates a correct card', () => {
    const result = validateAgentCard(makeValidCard())
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('reports missing required string fields', () => {
    const result = validateAgentCard({})
    expect(result.valid).toBe(false)
    expect(result.errors).toContainEqual(
      expect.stringContaining('"schemaVersion"')
    )
    expect(result.errors).toContainEqual(expect.stringContaining('"name"'))
    expect(result.errors).toContainEqual(expect.stringContaining('"url"'))
    expect(result.errors).toContainEqual(
      expect.stringContaining('"protocolVersion"')
    )
  })

  it('reports empty string fields', () => {
    const result = validateAgentCard(
      makeValidCard({ name: '  ', description: '' })
    )
    expect(result.valid).toBe(false)
    expect(result.errors).toContainEqual(expect.stringContaining('"name"'))
    expect(result.errors).toContainEqual(
      expect.stringContaining('"description"')
    )
  })

  it('reports invalid preferredTransport', () => {
    const result = validateAgentCard(
      makeValidCard({ preferredTransport: 'WEBSOCKET' })
    )
    expect(result.valid).toBe(false)
    expect(result.errors).toContainEqual(expect.stringContaining('WEBSOCKET'))
  })

  it('accepts all valid transports', () => {
    for (const transport of ['JSONRPC', 'gRPC', 'REST']) {
      const result = validateAgentCard(
        makeValidCard({ preferredTransport: transport })
      )
      expect(result.valid).toBe(true)
    }
  })

  it('reports missing provider', () => {
    const result = validateAgentCard(makeValidCard({ provider: undefined }))
    expect(result.valid).toBe(false)
    expect(result.errors).toContainEqual(expect.stringContaining('"provider"'))
  })

  it('reports missing provider.name', () => {
    const result = validateAgentCard(
      makeValidCard({ provider: { url: 'https://example.com' } })
    )
    expect(result.valid).toBe(false)
    expect(result.errors).toContainEqual(
      expect.stringContaining('"provider.name"')
    )
  })

  it('reports missing capabilities', () => {
    const result = validateAgentCard(makeValidCard({ capabilities: undefined }))
    expect(result.valid).toBe(false)
    expect(result.errors).toContainEqual(
      expect.stringContaining('"capabilities"')
    )
  })

  it('reports missing capabilities.a2aVersion', () => {
    const result = validateAgentCard(
      makeValidCard({ capabilities: { streaming: true } })
    )
    expect(result.valid).toBe(false)
    expect(result.errors).toContainEqual(
      expect.stringContaining('"capabilities.a2aVersion"')
    )
  })

  it('reports missing authSchemes', () => {
    const result = validateAgentCard(makeValidCard({ authSchemes: undefined }))
    expect(result.valid).toBe(false)
    expect(result.errors).toContainEqual(
      expect.stringContaining('"authSchemes"')
    )
  })

  it('reports empty authSchemes array', () => {
    const result = validateAgentCard(makeValidCard({ authSchemes: [] }))
    expect(result.valid).toBe(false)
    expect(result.errors).toContainEqual(
      expect.stringContaining('at least one scheme')
    )
  })

  it('reports authScheme missing scheme field', () => {
    const result = validateAgentCard(
      makeValidCard({ authSchemes: [{ serviceUrl: 'https://x.com' }] })
    )
    expect(result.valid).toBe(false)
    expect(result.errors).toContainEqual(
      expect.stringContaining('authSchemes[0]')
    )
  })

  it('reports invalid url', () => {
    const result = validateAgentCard(makeValidCard({ url: 'not-a-url' }))
    expect(result.valid).toBe(false)
    expect(result.errors).toContainEqual(expect.stringContaining('Invalid URL'))
  })

  it('reports invalid skill fields', () => {
    const result = validateAgentCard(
      makeValidCard({
        skills: [{ id: 'ok', name: 'ok' }] // missing description
      })
    )
    expect(result.valid).toBe(false)
    expect(result.errors).toContainEqual(expect.stringContaining('skills[0]'))
    expect(result.errors).toContainEqual(
      expect.stringContaining('"description"')
    )
  })

  it('warns when no skills defined', () => {
    const result = validateAgentCard(makeValidCard({ skills: undefined }))
    expect(result.valid).toBe(true)
    expect(result.warnings).toContainEqual(
      expect.stringContaining('No "skills"')
    )
  })

  it('warns when no documentationUrl', () => {
    const result = validateAgentCard(makeValidCard())
    expect(result.warnings).toContainEqual(
      expect.stringContaining('documentationUrl')
    )
  })

  it('warns on invalid documentationUrl', () => {
    const result = validateAgentCard(
      makeValidCard({ documentationUrl: 'bad-url' })
    )
    expect(result.warnings).toContainEqual(
      expect.stringContaining('Invalid documentationUrl')
    )
  })

  it('no warning when documentationUrl is valid', () => {
    const result = validateAgentCard(
      makeValidCard({ documentationUrl: 'https://docs.example.com' })
    )
    const docWarnings = result.warnings.filter(w =>
      w.includes('documentationUrl')
    )
    expect(docWarnings).toHaveLength(0)
  })
})
