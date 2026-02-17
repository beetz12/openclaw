# Mission Control Chat Interface — Design Document

> **Status:** APPROVED WITH REVISIONS (Multi-Agent Brainstorming Review Complete)
> **Date:** 2026-02-17
> **Reviewed by:** Skeptic, Constraint Guardian, User Advocate, Integrator/Arbiter

---

## Understanding Summary

1. **What:** A unified chat interface in Mission Control that becomes the single entry point for all user interaction with OpenClaw
2. **Why:** Eliminates fragmented UX — no need for TUI, channels, or separate Goal Input page to control OpenClaw
3. **Who:** Solo operators running VWP for IT consulting or e-commerce
4. **Core behavior:** User chats naturally; OpenClaw classifies intent (conversational vs task) and routes accordingly
5. **Guided onboarding:** First-run experience through chat OR wizard, setting up virtual team members
6. **Virtual team:** Predefined roles per business type (required + optional), assigned tasks by the dispatcher
7. **Non-goals:** Not replacing external channels. Not multi-user/multi-tenant.

---

## Architecture (Post-Review Revision)

The key architectural change from the original design: **no browser-side WebSocket**. Chat flows through HTTP + SSE, same as the board. The server-side vwp-dispatch plugin proxies chat to the Gateway via its existing GatewayClient.

```
Mission Control (localhost:3000)
  |
  |  POST /vwp/chat/send         (user message)
  |  SSE  /vwp/events            (chat_message + board events)
  |
  v
OpenClaw HTTP Server (vwp-dispatch plugin)
  |
  |  1. Intent Classification
  |     - conversational -> stream response via SSE chat_message events
  |     - task request   -> dispatch to VWP, show confirmation in chat
  |     - ambiguous      -> ask user to clarify
  |
  |  2. Existing GatewayClient (WebSocket to Gateway, server-side)
  |     - proxies chat messages to OpenClaw agent pipeline
  |     - receives streaming responses
  |     - emits SSE events to browser
  |
  v
OpenClaw Gateway (localhost:18789)
  |
  v
Agent Pipeline (existing)
```

**Why this is better than direct browser WebSocket:**

- Works from phones / LAN devices (no localhost restriction)
- No mixed-content (ws:// on https:// page) issues
- Single browser connection (SSE) instead of two (SSE + WS)
- Reuses existing SSE infrastructure, reconnect logic, and auth
- Server-side GatewayClient already exists and handles auth

---

## Route Changes

| Route       | Before               | After                                          |
| ----------- | -------------------- | ---------------------------------------------- |
| `/`         | Redirect to `/board` | **Chat interface (new home)**                  |
| `/board`    | Kanban board         | Kanban board (unchanged, moved from `/`)       |
| `/goals`    | Goal Input form      | Goal Input form (kept as "advanced" secondary) |
| `/tools`    | Workspace tools      | Unchanged                                      |
| `/cost`     | Cost dashboard       | Unchanged                                      |
| `/settings` | N/A                  | **New: team management, reset onboarding**     |

**Navigation tab bar:** Chat | Board | Tools | Cost | Settings

---

## Backend Changes

### New HTTP Endpoints (in vwp-dispatch)

```typescript
// Chat message submission
POST /vwp/chat/send
Body: { message: string, conversationId?: string }
Response: 202 { messageId: string }
// Response streams back via SSE chat_message events

// Chat history (for rehydration)
GET /vwp/chat/history?conversationId=<id>&limit=100&before=<messageId>
Response: 200 { messages: ChatMessage[] }

// Team config
GET /vwp/team
Response: 200 { team: TeamConfig }

PUT /vwp/team/members/:id
Body: Partial<TeamMember>
Response: 200 { member: TeamMember }

POST /vwp/team/members
Body: TeamMember
Response: 201 { member: TeamMember }

DELETE /vwp/team/members/:id
Response: 200 { deleted: true }
```

### New SSE Event Types

```typescript
type ChatSSEEvent =
  | { type: "chat_message"; messageId: string; role: "assistant"; content: string; done: boolean }
  | { type: "chat_stream_token"; messageId: string; token: string }
  | { type: "chat_task_dispatched"; messageId: string; taskId: string; title: string }
  | { type: "chat_intent_clarify"; messageId: string; question: string; options: string[] }
  | { type: "chat_team_suggest"; messageId: string; role: string; description: string };
```

### Intent Classification

New step before the analyzer. When a message arrives via `/vwp/chat/send`:

1. **Intent classifier prompt** asks OpenClaw: "Is this a conversational message, a task request, or ambiguous?"
2. If **conversational**: stream response back via `chat_message` SSE events
3. If **task request**: run through analyzer, show decomposition in chat with Confirm/Cancel
4. If **ambiguous**: emit `chat_intent_clarify` event, user picks in UI

The analyzer (`analyzer.ts`) is only invoked for confirmed task requests.

### Team-Aware Task Assignment

Enhancement to `analyzer.ts`:

1. Load `team.json` during analysis
2. After decomposing subtasks, match each to a team member by `skills[]` overlap
3. Set `subtask.assignedTo = teamMember.id`
4. If no matching member: set `subtask.suggestedRole = { name, description }`
5. Chat surfaces suggested roles via `chat_team_suggest` SSE event

### File Storage

```
~/.openclaw/vwp/
  team.json           # Virtual team configuration
  onboarding.json     # Onboarding completion state
  chat/
    <conversationId>/
      messages.jsonl   # Server-side chat persistence (append-only)
```

---

## Frontend Changes

### New Files

```
apps/vwp-board/src/
  app/
    page.tsx                  # Rewrite: Chat home
    settings/
      page.tsx                # New: team management, reset onboarding
  components/
    chat/
      ChatView.tsx            # Main container
      ChatInput.tsx           # Message input + "Run as task" toggle
      ChatMessage.tsx         # Message bubble (user/assistant)
      ChatStream.tsx          # Streaming response renderer
      TaskDispatchCard.tsx    # Inline task confirmation (Confirm/Cancel)
      TeamSuggestCard.tsx     # "Add team member?" prompt
      IntentClarifyCard.tsx   # "Task or question?" prompt
      GatewayStatusBanner.tsx # "Gateway not running" full-bleed banner
  hooks/
    useChatSSE.ts             # Handles chat-specific SSE events
  store/
    chat-store.ts             # Zustand: messages, streaming, connection
```

### Chat Store (Zustand)

```typescript
type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  taskDispatch?: { taskId: string; title: string };
  intentClarify?: { question: string; options: string[] };
  teamSuggest?: { role: string; description: string };
};

type ChatStore = {
  messages: ChatMessage[];
  isStreaming: boolean;
  onboardingComplete: boolean;
  teamConfig: TeamConfig | null;

  // Actions
  sendMessage: (text: string, asTask?: boolean) => void;
  confirmTask: (taskId: string) => void;
  cancelTask: (taskId: string) => void;
  clarifyIntent: (messageId: string, choice: "chat" | "task") => void;
  acceptTeamMember: (role: string) => void;
  loadHistory: (before?: string) => void;
  clearHistory: () => void;
};
```

### Chat Persistence (Client-Side)

- Messages saved to `localStorage` keyed by `vwp-chat-messages`
- Capped at 200 messages (oldest trimmed on overflow)
- On mount: load from `localStorage`, then call `GET /vwp/chat/history` for any missed messages
- Streaming uses mutable ref + 100ms throttled state commits (not per-token re-renders)
- Rendered message list capped at 100; "Load earlier" button for older messages

### Connection Status

Unified `ConnectionManager` in board-store:

```typescript
type ConnectionStatus = "connected" | "degraded" | "disconnected";

// Aggregate from existing sseConnected + gatewayConnected (via gateway_status SSE)
// Single indicator in header bar
// Individual status in hover tooltip
```

When gateway is down: full-bleed `GatewayStatusBanner` above chat input. Input disabled with placeholder: "OpenClaw Gateway is not running. Start it with: pnpm vwp:start"

### Intent Classification UI

When user sends a message, the `ChatInput` component has:

- Default mode: normal chat (OpenClaw classifies intent)
- "Run as task" toggle/button: explicitly marks message as a task request
- When OpenClaw is unsure: `IntentClarifyCard` appears inline with two buttons: "Just chatting" / "Run as task"

When a task is dispatched: `TaskDispatchCard` shows inline with:

- Task title and subtask preview
- **Confirm** button (calls `POST /vwp/dispatch/confirm/:id`)
- **Cancel** button (calls `DELETE /vwp/dispatch/tasks/:id`)
- No budget consumed until user confirms

---

## Guided Onboarding

### Hybrid Approach

1. **Primary path:** Existing wizard UI (OnboardingProvider) — retained with progress dots, Back/Next, Skip
2. **Secondary path:** Chat-based setup assistant — conversational onboarding via chat
3. On first visit, user chooses: "Quick Setup (wizard)" or "Chat with Setup Assistant"

### Chat Onboarding Flow

When the user chooses chat onboarding, the system prompt guides OpenClaw:

**Step 1:** Get to know the user (name, business name, brief description)
**Step 2:** Business type selection (IT Consulting / E-commerce / Custom)
**Step 3:** Present recommended virtual team, ask for customization
**Step 4:** Confirm team, complete setup

When ready, OpenClaw calls `complete_onboarding` tool with Zod-validated payload:

```typescript
const OnboardingPayload = z.object({
  businessType: z.enum(["consulting", "ecommerce", "custom"]),
  businessName: z.string(),
  userName: z.string(),
  team: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      role: z.string(),
      description: z.string(),
      skills: z.array(z.string()),
      required: z.boolean(),
      active: z.boolean(),
    }),
  ),
});
```

If validation fails: fall back to wizard pre-populated with extracted data.

---

## Virtual Team Roles

### IT Consulting / Professional Services

| Role                 | ID                     | Required | Skills                                      | Description                                                                           |
| -------------------- | ---------------------- | -------- | ------------------------------------------- | ------------------------------------------------------------------------------------- |
| CEO / Strategy Lead  | `ceo`                  | Yes      | strategy, planning, client-relations        | Business strategy, client relationships, proposal approvals, portfolio prioritization |
| Project Manager      | `project-manager`      | Yes      | project-management, coordination, delivery  | Task coordination, timelines, budgets, client communication, delivery tracking        |
| Marketing Strategist | `marketing-strategist` | Yes      | marketing, content, lead-generation         | Lead generation, branding, content strategy, positioning for IT services              |
| Solution Architect   | `solution-architect`   | No       | architecture, technical-design, integration | Technical design, system integration, architecture decisions                          |
| Developer / DevOps   | `developer`            | No       | development, devops, automation             | Custom software, automation, infrastructure, CI/CD pipelines                          |
| Business Analyst     | `business-analyst`     | No       | analysis, requirements, documentation       | Requirements gathering, process mapping, client-facing documentation                  |

### E-commerce / Online Retail

| Role                | ID                  | Required | Skills                                   | Description                                                      |
| ------------------- | ------------------- | -------- | ---------------------------------------- | ---------------------------------------------------------------- |
| CEO / Strategy Lead | `ceo`               | Yes      | strategy, planning, vendor-management    | Vision, vendor coordination, growth planning, budget decisions   |
| Marketing Manager   | `marketing-manager` | Yes      | marketing, social-media, email, seo, ads | Social media, email campaigns, ad management, SEO, content       |
| Product Manager     | `product-manager`   | Yes      | product, catalog, pricing, ux            | Catalog management, inventory, pricing strategy, UX decisions    |
| Customer Support    | `customer-support`  | Yes      | support, customer-service, returns       | Inquiries, returns, reviews, FAQ management, chat support        |
| Content Creator     | `content-creator`   | No       | content, copywriting, brand-voice        | Product descriptions, blog posts, social content, brand voice    |
| Data Analyst        | `data-analyst`      | No       | analytics, reporting, conversion         | Sales analytics, conversion tracking, customer behavior insights |

---

## Decision Log

| #   | Decision                                           | Alternatives                   | Objections                                               | Resolution                                                               |
| --- | -------------------------------------------------- | ------------------------------ | -------------------------------------------------------- | ------------------------------------------------------------------------ |
| D1  | Chat as home page (`/`)                            | Keep board as home             | UA5: breaks spatial memory                               | Accept change + one-time toast notification                              |
| D2  | HTTP/SSE proxy (not browser WebSocket)             | Direct browser WS to gateway   | S5: localhost breaks mobile; S2: dual connections        | Proxy through vwp-dispatch server. Eliminates 5 objections.              |
| D3  | Hybrid onboarding (wizard primary + chat optional) | Chat-only onboarding           | S3: LLM writes fragile JSON; UA6: no progress indicators | Keep wizard as primary, add chat as secondary with Zod validation        |
| D4  | Explicit intent classification before analyzer     | Let analyzer handle everything | S4: no escape hatch; UA3: no undo                        | Three-way classification (chat/task/ambiguous) + user confirmation       |
| D5  | Keep Goal Input at `/goals` as secondary           | Remove it                      | UA2: overlapping surfaces                                | Two surfaces: Chat (primary) + Goal Input (advanced). Clear distinction. |
| D6  | Chat persistence in localStorage + server JSONL    | No persistence                 | S1: refresh destroys context                             | Client-side localStorage (200 cap) + server-side append-only JSONL       |
| D7  | Unified ConnectionManager                          | Independent status indicators  | S2, CG4: split-brain UI                                  | Single aggregate status + per-channel tooltip                            |
| D8  | Task confirmation inline in chat before execution  | Auto-execute on dispatch       | UA3: no cancel; budget consumed                          | Confirm/Cancel buttons in TaskDispatchCard                               |
| D9  | Settings page with visible team management buttons | Magic text commands only       | UA4: undiscoverable                                      | Settings page + text commands as convenience                             |
| D10 | File-lock for board-state read-modify-write        | No locking                     | CG1: race conditions                                     | Targeted lock on moveTask/reorderTask                                    |

---

## Implementation Priority

### Must-Have for v1 (Blocking)

| ID  | Revision                  | Description                                                          |
| --- | ------------------------- | -------------------------------------------------------------------- |
| R1  | Chat persistence          | localStorage (200 cap) + server JSONL + rehydration on mount         |
| R2  | HTTP/SSE chat proxy       | POST /vwp/chat/send + SSE chat_message events. No browser WebSocket. |
| R3  | Hybrid onboarding         | Wizard primary + chat secondary with Zod-validated tool call         |
| R4  | Intent classification     | Three-way classifier + "Run as task" toggle + ambiguity prompt       |
| R5  | Gateway-down banner       | Full-bleed banner, disabled input, explanatory placeholder           |
| R6  | Two input surfaces        | Chat (primary `/`) + Goal Input (advanced `/goals`)                  |
| R7  | Task confirmation in chat | Inline Confirm/Cancel before budget consumed                         |
| R8  | Unified connection status | ConnectionManager aggregate + hover tooltip                          |

### Should-Have for v1

| ID  | Revision                  | Description                                                          |
| --- | ------------------------- | -------------------------------------------------------------------- |
| R9  | File-lock for board-state | Lock around moveTask/reorderTask read-modify-write                   |
| R10 | Chat rendering limits     | 100 rendered messages + "load earlier" + throttled streaming         |
| R11 | Language normalization    | Analyzer prompt normalizes informal chat language for skill matching |
| R12 | Settings page             | Visible buttons for Reset Team, Re-run Onboarding                    |

### Nice-to-Have for v2

| ID  | Revision                 | Description                                         |
| --- | ------------------------ | --------------------------------------------------- |
| R13 | First-visit toast        | "Chat is now the home page" notification            |
| R14 | Pinned task status       | Persistent card above input for in-flight tasks     |
| R15 | Gateway reconnect resume | Auto-resend conversation context on gateway restart |

---

## Testing Strategy

- `gateway-ws-proxy.ts` — unit tests for chat proxy (mock GatewayClient)
- `intent-classifier.ts` — unit tests for three-way classification
- `chat-store.ts` — unit tests for state transitions, persistence, rehydration
- `useChatSSE.ts` — unit tests for SSE event handling
- `ChatView` — Playwright E2E: send message, receive response, task dispatch flow, onboarding flow
- `TeamConfig` — unit tests for Zod validation, team CRUD
- `analyzer.ts` — unit tests for team member assignment + suggestedRole
- Existing board/tools/approval tests — verify no regressions from route changes
