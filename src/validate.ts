import type { A2AAgentCard } from '@402md/skillmd'

export interface AgentCardValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

const REQUIRED_STRING_FIELDS: (keyof A2AAgentCard)[] = [
  'schemaVersion',
  'humanReadableId',
  'agentVersion',
  'name',
  'description',
  'url',
  'protocolVersion',
  'preferredTransport'
]

const VALID_TRANSPORTS = ['JSONRPC', 'gRPC', 'REST']

/**
 * Validate an A2A Agent Card against the v0.3.0 specification.
 * Returns errors for missing/invalid required fields,
 * and warnings for recommended fields.
 */
export function validateAgentCard(
  card: Record<string, unknown>
): AgentCardValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // Required string fields
  for (const field of REQUIRED_STRING_FIELDS) {
    if (typeof card[field] !== 'string' || card[field].trim() === '') {
      errors.push(`Missing or empty required field: "${field}"`)
    }
  }

  // preferredTransport must be a valid value
  if (
    typeof card.preferredTransport === 'string' &&
    !VALID_TRANSPORTS.includes(card.preferredTransport)
  ) {
    errors.push(
      `Invalid preferredTransport: "${card.preferredTransport}". Must be one of: ${VALID_TRANSPORTS.join(', ')}`
    )
  }

  // provider (required object with name)
  if (!card.provider || typeof card.provider !== 'object') {
    errors.push('Missing required field: "provider"')
  } else {
    const provider = card.provider as Record<string, unknown>
    if (typeof provider.name !== 'string' || provider.name.trim() === '') {
      errors.push('Missing or empty required field: "provider.name"')
    }
  }

  // capabilities (required object with a2aVersion)
  if (!card.capabilities || typeof card.capabilities !== 'object') {
    errors.push('Missing required field: "capabilities"')
  } else {
    const caps = card.capabilities as Record<string, unknown>
    if (typeof caps.a2aVersion !== 'string' || caps.a2aVersion.trim() === '') {
      errors.push('Missing or empty required field: "capabilities.a2aVersion"')
    }
  }

  // authSchemes (required non-empty array)
  if (!Array.isArray(card.authSchemes)) {
    errors.push('Missing required field: "authSchemes" (must be an array)')
  } else if (card.authSchemes.length === 0) {
    errors.push('"authSchemes" must contain at least one scheme')
  } else {
    for (let i = 0; i < card.authSchemes.length; i++) {
      const scheme = card.authSchemes[i] as Record<string, unknown>
      if (!scheme || typeof scheme.scheme !== 'string') {
        errors.push(`authSchemes[${i}] is missing required "scheme" field`)
      }
    }
  }

  // url format
  if (typeof card.url === 'string') {
    try {
      new URL(card.url)
    } catch {
      errors.push(`Invalid URL: "${card.url}"`)
    }
  }

  // Warnings for recommended fields
  if (!card.skills || !Array.isArray(card.skills) || card.skills.length === 0) {
    warnings.push(
      'No "skills" defined — agents may not know what this agent can do'
    )
  } else {
    for (let i = 0; i < card.skills.length; i++) {
      const skill = card.skills[i] as Record<string, unknown>
      if (typeof skill.id !== 'string') {
        errors.push(`skills[${i}] is missing required "id" field`)
      }
      if (typeof skill.name !== 'string') {
        errors.push(`skills[${i}] is missing required "name" field`)
      }
      if (typeof skill.description !== 'string') {
        errors.push(`skills[${i}] is missing required "description" field`)
      }
    }
  }

  if (typeof card.documentationUrl === 'string') {
    try {
      new URL(card.documentationUrl)
    } catch {
      warnings.push(`Invalid documentationUrl: "${card.documentationUrl}"`)
    }
  }

  if (!card.documentationUrl) {
    warnings.push('No "documentationUrl" — consider adding a link to your docs')
  }

  return { valid: errors.length === 0, errors, warnings }
}
