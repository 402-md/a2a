// ── Discovery (serve + fetch) ─────────────────────────
export { serveAgentCard, serveAgentCardHono } from './serve'
export type { ServeAgentCardOptions } from './serve'
export { fetchAgentCard } from './client'

// ── Client ────────────────────────────────────────────
export { A2AClient, A2AClientError } from './client'
export type { A2AClientOptions } from './client'

// ── Server handler ────────────────────────────────────
export { handleA2A } from './handler'
export type { A2AHandlers, HandleA2AOptions } from './handler'

// ── Next.js App Router ───────────────────────────────
export { agentCardResponse, handleA2ANext } from './next'

// ── Validation ────────────────────────────────────────
export { validateAgentCard } from './validate'
export type { AgentCardValidationResult } from './validate'

// ── Protocol types ────────────────────────────────────
export type {
  Task,
  TaskState,
  TaskStatus,
  Message,
  Part,
  TextPart,
  FilePart,
  DataPart,
  Artifact,
  SendTaskParams,
  GetTaskParams,
  CancelTaskParams,
  PushNotificationConfig,
  SetPushNotificationParams,
  GetPushNotificationParams,
  TaskStatusUpdateEvent,
  TaskArtifactUpdateEvent,
  TaskUpdateEvent,
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcError
} from './types'
export { A2A_ERROR_CODES } from './types'

// ── Re-exports from @402md/skillmd ────────────────────
export { toAgentCard } from '@402md/skillmd'
export type {
  ToAgentCardOptions,
  A2AAgentCard,
  A2ATransport,
  A2AProvider,
  A2ACapabilities,
  A2AAuthScheme,
  A2ASkill
} from '@402md/skillmd'
