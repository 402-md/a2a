# @402md/a2a

[![npm version](https://img.shields.io/npm/v/@402md/a2a)](https://www.npmjs.com/package/@402md/a2a)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![A2A](https://img.shields.io/badge/A2A-v0.3.0-00C853)](https://google.github.io/A2A/)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6)](https://www.typescriptlang.org)
[![x402](https://img.shields.io/badge/x402-compatible-green)](https://x402.org)
[![JSON--RPC](https://img.shields.io/badge/JSON--RPC-2.0-orange)](https://www.jsonrpc.org/specification)

A2A protocol SDK for Node.js. Discover, publish, and communicate with AI agents using the [Agent-to-Agent (A2A)](https://google.github.io/A2A/) standard v0.3.0.

- **Serve** — Middleware to serve your Agent Card at `/.well-known/agent-card.json`
- **Client** — JSON-RPC client to send tasks to remote agents (with SSE streaming)
- **Handler** — JSON-RPC server middleware to receive and process tasks
- **Validate** — Validate Agent Cards against the spec
- **Discover** — Fetch Agent Cards from any A2A-compatible agent

Zero framework lock-in. Works with Express, Hono, Next.js, Connect, and raw Node.js HTTP.

## Installation

```bash
npm install @402md/a2a
```

---

## Quick Start

### 1. Publish your agent (serve the Agent Card)

```typescript
import express from 'express'
import { serveAgentCard } from '@402md/a2a'

const app = express()

// Reads ./SKILL.md and serves the Agent Card automatically
app.use(serveAgentCard())

app.listen(3000)
```

```bash
curl http://localhost:3000/.well-known/agent-card.json
```

### Next.js App Router

```typescript
// app/.well-known/agent-card.json/route.ts
import { agentCardResponse } from '@402md/a2a'

export const GET = agentCardResponse()
```

```typescript
// app/a2a/route.ts
import { handleA2ANext } from '@402md/a2a'

export const POST = handleA2ANext({
  onSendTask: async (params) => ({
    id: params.id,
    status: {
      state: 'completed',
      message: {
        role: 'agent',
        parts: [{ type: 'text', text: `You said: ${params.message.parts[0].type === 'text' ? params.message.parts[0].text : ''}` }]
      }
    }
  })
})
```

### 2. Discover a remote agent

```typescript
import { fetchAgentCard } from '@402md/a2a'

const card = await fetchAgentCard('https://agent.example.com')
console.log(card.name, card.skills)
```

### 3. Send a task to a remote agent

```typescript
import { A2AClient } from '@402md/a2a'

const client = new A2AClient('https://agent.example.com')

const task = await client.sendTask({
  role: 'user',
  parts: [{ type: 'text', text: 'What is the weather in Tokyo?' }]
})

console.log(task.status.state) // 'completed'
console.log(task.status.message) // agent's response
```

### 4. Handle incoming tasks (be an A2A server)

```typescript
import express from 'express'
import { serveAgentCard, handleA2A } from '@402md/a2a'

const app = express()

// Discovery
app.use(serveAgentCard())

// Task handler
app.use(handleA2A({
  onSendTask: async (params) => {
    const userText = params.message.parts
      .filter(p => p.type === 'text')
      .map(p => p.text)
      .join(' ')

    return {
      id: params.id,
      status: {
        state: 'completed',
        message: {
          role: 'agent',
          parts: [{ type: 'text', text: `You said: ${userText}` }]
        }
      }
    }
  }
}))

app.listen(3000)
```

---

## API Reference

### Discovery

#### `serveAgentCard(options?)`

Express/Connect middleware that serves the Agent Card at `/.well-known/agent-card.json`.

```typescript
function serveAgentCard(options?: ServeAgentCardOptions | string): Middleware
```

- Reads `SKILL.md` once at startup, caches the JSON
- String shorthand: `serveAgentCard('./path/to/SKILL.md')`
- `Cache-Control: public, max-age=3600` by default

#### `serveAgentCardHono(options?)`

Same as `serveAgentCard`, but for Hono:

```typescript
import { Hono } from 'hono'
import { serveAgentCardHono } from '@402md/a2a'

const app = new Hono()
app.use(serveAgentCardHono())
```

#### `ServeAgentCardOptions`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `skillMdPath` | `string` | `'./SKILL.md'` | Path to the SKILL.md file |
| `card` | `A2AAgentCard` | — | Pre-built card (skips file reading) |
| `maxAge` | `number` | `3600` | Cache-Control max-age in seconds |
| `url` | `string` | manifest `base_url` | Override the agent's URL |
| `providerName` | `string` | manifest `author` | Provider organization name |
| `providerUrl` | `string` | — | Provider URL |
| `authSchemes` | `A2AAuthScheme[]` | `[{ scheme: 'x402' }]` | Authentication schemes |
| `preferredTransport` | `A2ATransport` | `'REST'` | Transport protocol |
| `streaming` | `boolean` | — | Streaming support |
| `pushNotifications` | `boolean` | — | Push notification support |
| `documentationUrl` | `string` | — | Link to docs |

#### `fetchAgentCard(baseUrl, options?)`

Fetch a remote agent's Agent Card:

```typescript
const card = await fetchAgentCard('https://agent.example.com')
// Hits GET https://agent.example.com/.well-known/agent-card.json
```

Supports `AbortSignal` for cancellation:

```typescript
const controller = new AbortController()
const card = await fetchAgentCard(url, { signal: controller.signal })
```

#### `toAgentCard(manifest, options?)`

Pure function to convert a `SkillManifest` into an `A2AAgentCard`. Re-exported from `@402md/skillmd`:

```typescript
import { toAgentCard } from '@402md/a2a'
import { parseSkillMd } from '@402md/skillmd'

const manifest = parseSkillMd(raw)
const card = toAgentCard(manifest, { providerName: 'Acme Corp' })
```

**Mapping:**

| Agent Card field | Source |
|-----------------|--------|
| `schemaVersion` | `'1.0'` |
| `humanReadableId` | `author/name` or `name` |
| `agentVersion` | `manifest.version` or `'1.0.0'` |
| `name` | `manifest.displayName` or `manifest.name` |
| `url` | `options.url` or `manifest.base_url` |
| `protocolVersion` | `'0.3.0'` |
| `authSchemes` | `options.authSchemes` or `[{ scheme: 'x402' }]` |
| `skills[]` | One per `manifest.endpoints` |

---

### Client

#### `A2AClient`

Full A2A JSON-RPC client with support for all standard methods:

```typescript
const client = new A2AClient('https://agent.example.com', {
  headers: { 'Authorization': 'Bearer token' }
})
```

**Methods:**

| Method | Description |
|--------|-------------|
| `client.agentCard()` | Fetch the agent's Agent Card |
| `client.sendTask(params)` | Send a task (`tasks/send`) |
| `client.sendTask(message, id?)` | Shorthand — pass a `Message` directly |
| `client.getTask(id, historyLength?)` | Get task status (`tasks/get`) |
| `client.cancelTask(id)` | Cancel a task (`tasks/cancel`) |
| `client.sendTaskSubscribe(params)` | Stream task updates via SSE (`tasks/sendSubscribe`) |
| `client.setPushNotification(id, config)` | Set push notification config |
| `client.getPushNotification(id)` | Get push notification config |

#### Sending a task

```typescript
// Full params
const task = await client.sendTask({
  id: 'task-123',
  message: {
    role: 'user',
    parts: [{ type: 'text', text: 'Summarize this document' }]
  },
  historyLength: 5
})

// Shorthand
const task = await client.sendTask(
  { role: 'user', parts: [{ type: 'text', text: 'Hello' }] },
  'task-456' // optional id, auto-generated if omitted
)
```

#### Streaming

```typescript
const params = {
  id: 'task-789',
  message: {
    role: 'user' as const,
    parts: [{ type: 'text' as const, text: 'Write a poem' }]
  }
}

for await (const event of client.sendTaskSubscribe(params)) {
  if (event.type === 'status') {
    console.log('Status:', event.status.state)
  } else if (event.type === 'artifact') {
    console.log('Artifact:', event.artifact)
  }
}
```

#### Error handling

```typescript
import { A2AClientError } from '@402md/a2a'

try {
  await client.sendTask(message)
} catch (err) {
  if (err instanceof A2AClientError) {
    console.log(err.statusCode) // HTTP status (e.g. 404)
    console.log(err.rpcCode)    // JSON-RPC error code (e.g. -32001)
    console.log(err.data)       // Extra error data from server
  }
}
```

---

### Server Handler

#### `handleA2A(handlers, options?)`

Express/Connect middleware that handles incoming A2A JSON-RPC requests:

```typescript
function handleA2A(handlers: A2AHandlers, options?: HandleA2AOptions): Middleware
```

**`A2AHandlers`:**

| Handler | Required | Method | Description |
|---------|----------|--------|-------------|
| `onSendTask` | Yes | `tasks/send` | Process an incoming task |
| `onGetTask` | No | `tasks/get` | Return task status (returns error if not implemented) |
| `onCancelTask` | No | `tasks/cancel` | Cancel a task (returns error if not implemented) |

**`HandleA2AOptions`:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `path` | `string` | `'/'` | Path to listen on for JSON-RPC requests |

#### Full server example with task persistence

```typescript
import express from 'express'
import { serveAgentCard, handleA2A } from '@402md/a2a'
import type { Task, SendTaskParams, GetTaskParams, CancelTaskParams } from '@402md/a2a'

const app = express()
const tasks = new Map<string, Task>()

app.use(serveAgentCard())

app.use(handleA2A({
  onSendTask: async (params: SendTaskParams): Promise<Task> => {
    const task: Task = {
      id: params.id,
      status: {
        state: 'completed',
        message: {
          role: 'agent',
          parts: [{ type: 'text', text: 'Task processed!' }]
        },
        timestamp: new Date().toISOString()
      },
      history: [params.message]
    }

    tasks.set(task.id, task)
    return task
  },

  onGetTask: async (params: GetTaskParams): Promise<Task> => {
    const task = tasks.get(params.id)
    if (!task) throw new Error('Task not found')
    return task
  },

  onCancelTask: async (params: CancelTaskParams): Promise<Task> => {
    const task = tasks.get(params.id)
    if (!task) throw new Error('Task not found')
    task.status = { state: 'canceled', timestamp: new Date().toISOString() }
    return task
  }
}))

app.listen(3000)
```

---

### Next.js App Router

#### `agentCardResponse(options?)`

Next.js route handler for serving the Agent Card. Use in `app/.well-known/agent-card.json/route.ts`:

```typescript
function agentCardResponse(options?: ServeAgentCardOptions | string): NextRouteHandler
```

Accepts the same `ServeAgentCardOptions` as `serveAgentCard()`. The card is built once and cached.

```typescript
// Default — reads ./SKILL.md
export const GET = agentCardResponse()

// Custom path
export const GET = agentCardResponse('./skills/my-agent.md')

// Pre-built card
export const GET = agentCardResponse({ card: myCard, maxAge: 7200 })
```

#### `handleA2ANext(handlers)`

Next.js route handler for A2A JSON-RPC requests. Use in `app/a2a/route.ts` (or any route):

```typescript
function handleA2ANext(handlers: A2AHandlers): NextRouteHandler
```

Same `A2AHandlers` interface as `handleA2A()` — `onSendTask` (required), `onGetTask`, `onCancelTask`.

#### Full Next.js example

```
app/
  .well-known/
    agent-card.json/
      route.ts          ← agentCardResponse()
  a2a/
    route.ts            ← handleA2ANext()
```

```typescript
// app/.well-known/agent-card.json/route.ts
import { agentCardResponse } from '@402md/a2a'

export const GET = agentCardResponse()
```

```typescript
// app/a2a/route.ts
import { handleA2ANext } from '@402md/a2a'
import type { Task, SendTaskParams, GetTaskParams } from '@402md/a2a'

const tasks = new Map<string, Task>()

export const POST = handleA2ANext({
  onSendTask: async (params: SendTaskParams): Promise<Task> => {
    const task: Task = {
      id: params.id,
      status: {
        state: 'completed',
        message: {
          role: 'agent',
          parts: [{ type: 'text', text: 'Processed by Next.js!' }]
        },
        timestamp: new Date().toISOString()
      },
      history: [params.message]
    }
    tasks.set(task.id, task)
    return task
  },

  onGetTask: async (params: GetTaskParams): Promise<Task> => {
    const task = tasks.get(params.id)
    if (!task) throw new Error('Task not found')
    return task
  }
})
```

---

### Validation

#### `validateAgentCard(card)`

Validate any object against the A2A v0.3.0 Agent Card spec:

```typescript
import { validateAgentCard } from '@402md/a2a'

const result = validateAgentCard(someCard)

if (!result.valid) {
  console.error('Errors:', result.errors)
}

if (result.warnings.length > 0) {
  console.warn('Warnings:', result.warnings)
}
```

**What it checks:**

| Category | Checks |
|----------|--------|
| **Required fields** | `schemaVersion`, `humanReadableId`, `agentVersion`, `name`, `description`, `url`, `protocolVersion`, `preferredTransport` |
| **Provider** | Must have `provider.name` |
| **Capabilities** | Must have `capabilities.a2aVersion` |
| **Auth** | `authSchemes` must be a non-empty array with valid `scheme` fields |
| **URL** | `url` and `documentationUrl` must be valid URLs |
| **Skills** | Each skill must have `id`, `name`, `description` |
| **Warnings** | Missing `skills`, missing `documentationUrl` |

#### Validate a fetched card

```typescript
import { fetchAgentCard, validateAgentCard } from '@402md/a2a'

const card = await fetchAgentCard('https://agent.example.com')
const { valid, errors, warnings } = validateAgentCard(card as Record<string, unknown>)

if (!valid) {
  console.error('This agent card is non-compliant:', errors)
}
```

---

## Combining Everything

### Full A2A agent with @402md/gateway

```typescript
import express from 'express'
import { Gateway } from '@402md/gateway'
import { serveAgentCard, handleA2A } from '@402md/a2a'

const app = express()
const gateway = new Gateway({ skillToken: process.env.SKILL_TOKEN })

// 1. Discovery — public
app.use(serveAgentCard())

// 2. A2A protocol — handles tasks/send, tasks/get, etc.
app.use('/a2a', handleA2A({
  onSendTask: async (params) => {
    // Your agent logic here
    return {
      id: params.id,
      status: { state: 'completed', message: {
        role: 'agent',
        parts: [{ type: 'text', text: 'Done!' }]
      }}
    }
  }
}, { path: '/a2a' }))

// 3. Direct REST API — protected by x402 payment
app.post('/v1/generate', gateway.protect(), (req, res) => {
  res.json({ result: 'paid content' })
})

app.listen(3000)
```

### Agent-to-agent communication

```typescript
import { A2AClient, fetchAgentCard } from '@402md/a2a'

// Discover
const card = await fetchAgentCard('https://other-agent.example.com')
console.log(`Found: ${card.name} with ${card.skills?.length ?? 0} skills`)

// Communicate
const client = new A2AClient('https://other-agent.example.com')
const task = await client.sendTask({
  role: 'user',
  parts: [{ type: 'text', text: 'Translate this to Japanese: Hello world' }]
})

if (task.status.state === 'completed') {
  const reply = task.status.message?.parts
    .filter(p => p.type === 'text')
    .map(p => (p as { text: string }).text)
    .join('')

  console.log('Translation:', reply)
}
```

---

## Types

### Protocol Types

```typescript
import type {
  // Tasks
  Task,
  TaskState,        // 'submitted' | 'working' | 'completed' | 'failed' | ...
  TaskStatus,
  Artifact,

  // Messages
  Message,          // { role: 'user' | 'agent', parts: Part[] }
  Part,             // TextPart | FilePart | DataPart
  TextPart,         // { type: 'text', text: string }
  FilePart,         // { type: 'file', file: { name?, mimeType?, bytes?, uri? } }
  DataPart,         // { type: 'data', data: Record<string, unknown> }

  // Params
  SendTaskParams,
  GetTaskParams,
  CancelTaskParams,
  PushNotificationConfig,

  // Streaming
  TaskStatusUpdateEvent,
  TaskArtifactUpdateEvent,
  TaskUpdateEvent,

  // JSON-RPC
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcError
} from '@402md/a2a'
```

### Agent Card Types

```typescript
import type {
  A2AAgentCard,
  A2ATransport,     // 'JSONRPC' | 'gRPC' | 'REST'
  A2AProvider,
  A2ACapabilities,
  A2AAuthScheme,
  A2ASkill,
  ToAgentCardOptions
} from '@402md/a2a'
```

### Error Codes

```typescript
import { A2A_ERROR_CODES } from '@402md/a2a'

A2A_ERROR_CODES.TASK_NOT_FOUND        // -32001
A2A_ERROR_CODES.TASK_NOT_CANCELABLE   // -32002
A2A_ERROR_CODES.UNSUPPORTED_OPERATION // -32004
A2A_ERROR_CODES.INVALID_REQUEST       // -32600
A2A_ERROR_CODES.METHOD_NOT_FOUND      // -32601
A2A_ERROR_CODES.INVALID_PARAMS        // -32602
A2A_ERROR_CODES.INTERNAL_ERROR        // -32603
A2A_ERROR_CODES.PARSE_ERROR           // -32700
```

---

## A2A Protocol Compatibility

This package targets **A2A specification v0.3.0**.

| Feature | Status |
|---------|--------|
| Agent Card discovery (`/.well-known/agent-card.json`) | Supported |
| `tasks/send` | Supported |
| `tasks/get` | Supported |
| `tasks/cancel` | Supported |
| `tasks/sendSubscribe` (SSE streaming) | Client only |
| `tasks/pushNotification/set` | Client only |
| `tasks/pushNotification/get` | Client only |

### Framework Support

| Framework | Discovery | Handler |
|-----------|-----------|---------|
| Express / Connect | `serveAgentCard()` | `handleA2A()` |
| Hono | `serveAgentCardHono()` | `handleA2A()` |
| Next.js App Router | `agentCardResponse()` | `handleA2ANext()` |
| Raw Node.js HTTP | `serveAgentCard()` | `handleA2A()` |

---

## License

MIT
