// ── A2A Protocol Types (v0.3.0) ───────────────────────
// These are the runtime protocol types (Task, Message, Part, etc.)
// Agent Card types live in @402md/skillmd

// ── Parts ─────────────────────────────────────────────

export interface TextPart {
  type: 'text'
  text: string
  metadata?: Record<string, unknown>
}

export interface FilePart {
  type: 'file'
  file: {
    name?: string
    mimeType?: string
    bytes?: string
    uri?: string
  }
  metadata?: Record<string, unknown>
}

export interface DataPart {
  type: 'data'
  data: Record<string, unknown>
  metadata?: Record<string, unknown>
}

export type Part = TextPart | FilePart | DataPart

// ── Messages ──────────────────────────────────────────

export interface Message {
  role: 'user' | 'agent'
  parts: Part[]
  metadata?: Record<string, unknown>
}

// ── Tasks ─────────────────────────────────────────────

export type TaskState =
  | 'submitted'
  | 'working'
  | 'input-required'
  | 'completed'
  | 'canceled'
  | 'failed'
  | 'rejected'
  | 'auth-required'
  | 'unknown'

export interface TaskStatus {
  state: TaskState
  message?: Message
  timestamp?: string
}

export interface Artifact {
  name?: string
  description?: string
  parts: Part[]
  index?: number
  append?: boolean
  lastChunk?: boolean
  metadata?: Record<string, unknown>
}

export interface Task {
  id: string
  contextId?: string
  status: TaskStatus
  artifacts?: Artifact[]
  history?: Message[]
  metadata?: Record<string, unknown>
}

// ── JSON-RPC ──────────────────────────────────────────

export interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: string | number
  method: string
  params?: Record<string, unknown>
}

export interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: string | number
  result?: unknown
  error?: JsonRpcError
}

export interface JsonRpcError {
  code: number
  message: string
  data?: unknown
}

// ── Method Params ─────────────────────────────────────

export interface SendTaskParams {
  id: string
  message: Message
  pushNotification?: PushNotificationConfig
  historyLength?: number
  metadata?: Record<string, unknown>
}

export interface GetTaskParams {
  id: string
  historyLength?: number
}

export interface CancelTaskParams {
  id: string
}

export interface SetPushNotificationParams {
  id: string
  pushNotificationConfig: PushNotificationConfig
}

export interface GetPushNotificationParams {
  id: string
}

export interface PushNotificationConfig {
  url: string
  token?: string
  authentication?: {
    schemes: string[]
    credentials?: string
  }
}

// ── Streaming Events ──────────────────────────────────

export interface TaskStatusUpdateEvent {
  type: 'status'
  taskId: string
  contextId?: string
  status: TaskStatus
  final: boolean
}

export interface TaskArtifactUpdateEvent {
  type: 'artifact'
  taskId: string
  contextId?: string
  artifact: Artifact
}

export type TaskUpdateEvent = TaskStatusUpdateEvent | TaskArtifactUpdateEvent

// ── Error Codes ───────────────────────────────────────

export const A2A_ERROR_CODES = {
  TASK_NOT_FOUND: -32001,
  TASK_NOT_CANCELABLE: -32002,
  PUSH_NOTIFICATION_NOT_SUPPORTED: -32003,
  UNSUPPORTED_OPERATION: -32004,
  CONTENT_TYPE_NOT_SUPPORTED: -32005,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  PARSE_ERROR: -32700
} as const
