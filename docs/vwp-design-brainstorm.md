# VWP (Virtual Workforce Platform) — Feature Design

## Status: REVISED (Post-Review)

This design has undergone structured review by Skeptic, Constraint Guardian, and User Advocate agents. All BLOCKER and HIGH-severity objections have been addressed. See Decision Log for full audit trail.

---

## Decision Log

| #   | Decision                                                             | Alternatives Considered                        | Objections                                                                                                                                                                                  | Resolution                                                                                                                                                                                                                                                                         |
| --- | -------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Leverage Claude's built-in agent teams for coordination              | Build custom coordination layer                | Skeptic #1: Agent teams are experimental with known failures (lead premature shutdown, task status lag, no session resumption). Skeptic #20: "Not rebuilding coordination" is aspirational. | REVISED: Use agent teams but add our own error handling, health monitoring, timeout-based nudging, and checkpoint-to-disk strategy. Add "We Build" items: error recovery, health checks, timeout handling, result persistence. Provide single-agent fallback mode for reliability. |
| 2   | Use openclaw's existing skills system to host knowledge-work plugins | Custom plugin loader                           | Skeptic #5: Plugin schema unvalidated. Constraint M1: External unversioned directory.                                                                                                       | REVISED: Add frontmatter schema validation at registry scan time. Pin knowledge-work-plugins via git submodule or npm reference for version control.                                                                                                                               |
| 3   | Build dispatch as an openclaw extension (`vwp-dispatch`)             | Build as a separate service                    | Skeptic #2-3: No programmatic TeamCreate API; plugin SDK doesn't expose agent team capabilities.                                                                                            | REVISED: Dispatch uses CLI subprocess spawning (similar to existing `runCliAgent()`) with natural-language team creation prompts, not a fictional TeamCreate API. Team creation is prompt-driven via Claude CLI.                                                                   |
| 4   | Python tool layer as a separate MCP server                           | Inline Python within TypeScript                | Skeptic #15-16: YAGNI — reimplements existing tools, toggle premature. Constraint C4: Dual maintenance cost.                                                                                | REVISED: **DEFERRED to Phase 2+.** MVP uses openclaw tools only. No toggle in Phase 1. Python MCP server is a future enhancement once MVP is validated.                                                                                                                            |
| 5   | Onboarding as rewrite of existing `vwp-dashboard` onboarding-view    | Separate onboarding app                        | Skeptic #22: This is a rewrite, not extension. User Advocate #5: 7 steps too heavy.                                                                                                         | REVISED: Acknowledge as rewrite. Reduce core path to 4 required steps (Welcome, Business Type, Business Basics, Done). Steps 4-6 are optional "enhance later" steps accessible from dashboard settings.                                                                            |
| 6   | All external actions require approval by default in MVP              | Auto-approve everything, or selective approval | User Advocate #16 (BLOCKER): Approval scope ambiguous for task dispatch. User Advocate #17: Agents can take unrequested actions.                                                            | NEW DECISION: In MVP, ALL actions with external side effects (email sends, CRM updates, social posts, etc.) queue for user approval. Auto-approve scoped to message-sending only. Task decomposition shown to user for confirmation before team launches.                          |
| 7   | Dashboard gets task submission + results views                       | Keep dashboard as message-approval only        | User Advocate #9 (BLOCKER): No task submission UI. User Advocate #10 (BLOCKER): No task results location. User Advocate #19 (BLOCKER): Product identity mismatch.                           | NEW DECISION: Add "New Task" input to home view. Add "Tasks" tab to navigation alongside Queue. Task results are a separate view, NOT in the approval queue. Frame product as "Your AI Assistant" for MVP, not "Virtual Workforce."                                                |
| 8   | MVP team size capped at 5 agents (1 lead + 4 specialists)            | Allow unlimited team sizes                     | Constraint C1 (BLOCKER): No cost controls. Skeptic #21: Cost underestimated. User Advocate #14: No cost visibility.                                                                         | NEW DECISION: Cap team size at 5 for MVP. Add mandatory cost estimation before dispatch with user confirmation ("This task will use approximately X tokens / ~$Y. Proceed?"). Basic cost tracking from day 1.                                                                      |
| 9   | Single-task-at-a-time with queue for MVP                             | Support concurrent multi-team dispatch         | Constraint R5: One-team-per-session limitation. Constraint SC2: No concurrency model.                                                                                                       | NEW DECISION: MVP processes one task at a time. Additional requests are queued with position indicator. Serial processing avoids one-team-per-session conflicts.                                                                                                                   |
| 10  | Persist intermediate results to disk as checkpoints                  | Rely on agent team session state only          | Constraint R1 (BLOCKER): No session resumption. Skeptic #24: Long-running tasks architectural limitation.                                                                                   | NEW DECISION: Each teammate writes intermediate results to `~/.openclaw/vwp/tasks/{task-id}/` as they complete sub-tasks. If session is interrupted, partial results survive. Not full resumption, but prevents total loss.                                                        |

---

## Known Limitations (Architectural)

These are inherent constraints of the underlying Claude Agent Teams infrastructure that cannot be fully mitigated by design:

1. **No session resumption**: If the team lead session crashes, teammates cannot be reconnected. Mitigation: checkpoint results to disk (Decision 10).
2. **Task status lag**: Teammates may fail to mark tasks complete. Mitigation: timeout-based health checks with lead nudging.
3. **Lead premature shutdown**: Team lead may decide work is done prematurely. Mitigation: explicit "wait for all teammates" instruction in lead prompt + timeout failsafe.
4. **One team per session**: Only one agent team can run at a time. Mitigation: serial task queue (Decision 9).
5. **Experimental status**: Agent teams may change or break between Claude Code versions. Mitigation: single-agent fallback mode that runs skills sequentially without teams.

---

## Feature 1: Agent Team Dispatch System

### Architecture

```
User Request (CLI or Dashboard)
        |
        v
+---------------------+
|  User Confirmation   |  Show task decomposition + cost estimate
|  "Proceed?"          |  User approves before team launches
+---------------------+
        |
        v
+---------------------+
|  vwp-dispatch        |  (openclaw extension)
|  - Task Analyzer     |  LLM call to decompose request into sub-tasks
|  - Skill Matcher     |  Maps sub-tasks to knowledge-work skills (with confidence)
|  - Team Assembler    |  Determines team composition (max 5 for MVP)
|  - Team Launcher     |  Spawns Claude CLI with natural-language team prompt
+---------------------+
        |
        v
+---------------------+
|  Claude Agent Team   |  (Claude Code's built-in coordination)
|  - Team Lead         |  Coordinates, synthesizes, writes checkpoints
|  - Specialist 1      |  Has skill summary + role-specific business context
|  - Specialist 2      |  Has skill summary + role-specific business context
|  - Specialist 3      |  Has skill summary + role-specific business context
|  - Specialist 4      |  Has skill summary + role-specific business context
|  (shared task list)  |  Claude manages task dependencies
|  (checkpoints)       |  Results saved to disk as sub-tasks complete
+---------------------+
        |
        v
+---------------------+
|  Approval Queue      |  All external actions queue for user review
+---------------------+
        |
        v
  Task Results View -> Dashboard
```

### How the Dispatch Works

1. **Task Analysis** (LLM call — adds ~5-10s latency, ~2K tokens):
   - When a user submits a task, an LLM call decomposes it into sub-tasks
   - Identifies which knowledge domains are needed
   - Determines parallelism opportunities
   - Returns structured JSON: `{ subtasks: [...], domains: [...], estimated_complexity: "low"|"medium"|"high" }`

2. **Skill Matching** (with confidence threshold):
   - Maps each sub-task to the most relevant skill(s)
   - Requires >0.7 confidence score; below threshold -> user confirmation
   - User sees: "I'll assign 'Help draft an email' to the Sales specialist and 'Create social post' to the Marketing specialist. OK?"
   - User-facing labels, not internal skill names

3. **Team Assembly** (MVP: max 5 agents):
   - Team lead: coordinator with synthesis instructions
   - Specialists: max 4, each loaded with their **skill summary** (not full SKILL.md) + **role-relevant** business context only
   - Cost estimate calculated and shown to user

4. **Team Launch** (via Claude CLI subprocess):
   - NOT a `TeamCreate` API call — uses `runCliAgent()` pattern with natural-language team creation prompt
   - Each teammate's spawn prompt includes: skill summary, role-relevant business context, checkpoint instructions
   - Team lead instructed to: wait for all teammates, write intermediate results, synthesize final output

5. **Result Collection**:
   - Sub-task results written to `~/.openclaw/vwp/tasks/{task-id}/`
   - All external actions (emails, CRM updates, etc.) queue in approval system
   - Synthesized result displayed in dashboard Task Results view

### What We Build vs What Claude Provides

| Capability                     | Source                              | Notes                                                                      |
| ------------------------------ | ----------------------------------- | -------------------------------------------------------------------------- |
| Task list management           | Claude Agent Teams                  | Shared task list, claiming, completion tracking                            |
| Inter-agent messaging          | Claude Agent Teams                  | Direct messages, broadcasts                                                |
| Teammate lifecycle             | Claude Agent Teams                  | Spawn, shutdown, idle detection                                            |
| Task decomposition             | **We build**                        | LLM call to analyze and split tasks (explicit cost)                        |
| Skill matching                 | **We build**                        | Map sub-tasks to skills with confidence threshold                          |
| User confirmation              | **We build**                        | Show decomposition + cost estimate for approval                            |
| Team sizing / cost estimation  | **We build**                        | Cap at 5, calculate expected token usage                                   |
| Skill injection                | **We build**                        | Load skill **summary** (not full file) into spawn prompts                  |
| Result synthesis               | **We build** (via team lead prompt) | Team lead synthesizes + writes checkpoints                                 |
| Business context injection     | **We build**                        | Inject **role-relevant** context per teammate (not everything to everyone) |
| Error handling / health checks | **We build**                        | Timeout-based nudging, partial failure detection                           |
| Result persistence             | **We build**                        | Checkpoint sub-task results to disk                                        |
| Approval gating                | **We build**                        | All external actions queue for user review                                 |
| Single-agent fallback          | **We build**                        | If teams unavailable, run skills sequentially in one session               |

### Implementation: `extensions/vwp-dispatch/`

```
extensions/vwp-dispatch/
+-- index.ts              # Plugin registration
+-- analyzer.ts           # Task analysis and decomposition (LLM call)
+-- skill-matcher.ts      # Maps tasks to knowledge-work skills (with confidence)
+-- team-assembler.ts     # Determines team composition (max 5 agents)
+-- team-launcher.ts      # Spawns Claude CLI with NL team prompt (NOT TeamCreate API)
+-- skill-registry.ts     # Indexes available skills with schema validation
+-- context-loader.ts     # Loads role-relevant business context (replaces business-context.ts)
+-- cost-estimator.ts     # Estimates token cost before dispatch
+-- task-queue.ts         # Serial task queue with position tracking
+-- checkpoint.ts         # Persists intermediate results to disk
+-- health-monitor.ts     # Timeout-based health checks for teammates
+-- routes.ts             # HTTP API for dashboard integration
+-- package.json
+-- index.test.ts
```

---

## Feature 2: Knowledge-Work Plugin Integration

### Available Skills Inventory (from /Users/dave/Work/knowledge-work-plugins)

| Plugin             | Skills | User-Facing Label    | IT Consultancy | Ecommerce |
| ------------------ | ------ | -------------------- | -------------- | --------- |
| sales              | 6      | Sales & Outreach     | HIGH           | MEDIUM    |
| customer-support   | 5      | Customer Service     | MEDIUM         | HIGH      |
| product-management | 6      | Project & Product    | HIGH           | MEDIUM    |
| marketing          | 5      | Marketing & Content  | MEDIUM         | HIGH      |
| finance            | 6      | Finance & Accounting | HIGH           | HIGH      |
| legal              | 6      | Legal & Compliance   | HIGH           | MEDIUM    |
| data               | 7      | Data & Analytics     | HIGH           | HIGH      |
| enterprise-search  | 3      | Research & Knowledge | HIGH           | MEDIUM    |
| productivity       | 2      | Productivity         | HIGH           | HIGH      |

### Integration Approach

1. **Skill Registry** (with validation):
   - At startup, scans knowledge-work-plugins directory
   - Validates each SKILL.md has required frontmatter (name, description)
   - Builds index with: plugin name, skill name, user-facing description, required MCP integrations
   - **Caches index in memory with file-watcher for invalidation**
   - Logs warnings for skills with missing/invalid frontmatter (does not crash)

2. **Skill Loading** (summarized, not full):
   - When a teammate needs a skill, generate a **summary** of the SKILL.md (key instructions, not full markdown + references)
   - Summary target: <2000 tokens to preserve context window
   - Full SKILL.md available as a file the agent can read if needed (reference path provided in prompt)

3. **MCP Integration** (via shared project config, not "forwarding"):
   - Teammates load the same `.mcp.json` from the project (this is how Claude Code works natively)
   - If a skill needs an MCP connector the user hasn't configured, the teammate logs a warning and skips that sub-task gracefully
   - User sees: "Could not complete 'Update CRM' — HubSpot not connected. Connect it in Settings."

4. **Skill Path Configuration**:
   - **Pinned via git submodule** for version control and reproducibility
   - Fallback: `VWP_KNOWLEDGE_PLUGINS_PATH` env var for development
   - Default: `./knowledge-work-plugins/` (submodule in repo root)

---

## Feature 3: User-Friendly Onboarding

### Design Principles (post-review)

- **Core path is fast**: 4 required steps, completable in <3 minutes
- **Heavy steps are optional**: Knowledge upload, channel setup, and skill config are "enhance later"
- **User-facing language**: No internal skill names or technical jargon
- **Business type includes "Other"**: Not a forced binary
- **Progressive disclosure**: Start simple, deepen over time via dashboard settings
- **Free-text alongside structured**: Dropdowns + "Describe your business" text field

### New Onboarding Flow

```
REQUIRED (Core Path):

Step 1: Welcome
  "Welcome to your AI Assistant"
  (NOT "Virtual Workforce Platform" — too much for first impression)

Step 2: Business Type Selection
  +----------------------+    +----------------------+    +----------------------+
  |  IT Consultancy      |    |  Ecommerce Business   |    |  Other Business      |
  |  ----------------    |    |  -------------------  |    |  ----------------    |
  |  Client projects     |    |  Products & orders    |    |  Tell us about       |
  |  SOWs & contracts    |    |  Inventory & shipping |    |  your business       |
  |  Technical delivery  |    |  Customer service     |    |  in your own words   |
  +----------------------+    +----------------------+    +----------------------+

  Note: Choice can be changed later in Settings.

Step 3: Business Basics (varies by type)
  IT Consultancy:
  - Company name
  - Services offered (multi-select dropdown + "Other" free text)
  - Team size
  - Primary verticals served
  - Free text: "Anything else about your business?"

  Ecommerce:
  - Store name
  - Platform (multi-select: Shopify, WooCommerce, Etsy, Own website, Other)
  - Product categories (free text)
  - Avg monthly orders
  - Free text: "Anything else about your business?"

  Other:
  - Business name
  - What does your business do? (free text)
  - Team size
  - What kind of help are you looking for? (free text)

Step 4: You're Ready!
  Summary of what we know
  "Your AI assistant is ready to help with basic tasks."
  "You can enhance it further from the dashboard."
  [Go to Dashboard]

OPTIONAL (accessible from Dashboard Settings, shown as "Enhance your assistant"):

  - Knowledge Upload: "Help your AI understand your business better"
    - Upload files (with size limits: max 10MB per file, 50MB total)
    - Paste key info
    - Each item is optional, can be done incrementally

  - Tool Connections: "Connect your business tools"
    - Shows which tools are available for their business type
    - One-click connect for supported MCP integrations
    - Status indicators (connected/not connected)

  - Skill Preferences: "Choose what your AI helps with"
    - User-facing labels, not technical names:
      IT Consultancy:
        [x] Help me with sales and outreach
        [x] Review contracts and legal documents
        [x] Manage projects and specs
        [x] Handle finance and accounting
        [x] Stay productive and organized

      Ecommerce:
        [x] Handle customer service
        [x] Create marketing content
        [x] Help with sales and outreach
        [x] Analyze my data
        [x] Stay productive and organized
```

### Data Storage

Onboarding data stored in `~/.openclaw/vwp/`:

```
~/.openclaw/vwp/
+-- profile.json          # Business type, name, settings, free-text description
+-- knowledge/            # Uploaded business documents (max 50MB total)
|   +-- {filename}        # Original files, validated type and size
+-- skill-config.json     # Which skills are enabled (user-facing labels mapped to internal names)
+-- connectors.json       # Configured MCP connections with health status
+-- tasks/                # Task results and checkpoints
    +-- {task-id}/
        +-- request.json  # Original user request
        +-- decomposition.json  # How task was broken down
        +-- results/      # Sub-task results (checkpoints)
        +-- final.json    # Synthesized result
```

---

## Feature 4: Python Tool Reimplementation & Tool Provider Toggle

### Status: DEFERRED TO PHASE 2+

Per review feedback (Skeptic #15-16, Constraint C4), the Python tool reimplementation and .env-based toggle are **deferred from MVP**. Rationale:

- MVP uses openclaw's built-in tools exclusively
- The toggle would have exactly one valid value ("openclaw") at MVP launch
- Dual implementation doubles maintenance burden with no validated user demand
- Existing MCP servers (Shopify, NotebookLM) already provide Python-alternative tooling

### Phase 2 Plan (future, not MVP)

When demand is validated:

1. Start with 2-3 most-requested tool reimplementations (likely email + CRM)
2. Add simple .env toggle (global only, no per-tool overrides initially)
3. Validate parity before expanding to more tools

---

## Feature 5: Additional Features for Fully Functional Product

### MVP (Phase 1) — Required

1. **Task Submission UI** (NEW — addresses User Advocate BLOCKER #9)
   - Text input on dashboard home view: "What would you like help with?"
   - Simple first-task suggestions per business type
   - Shows task decomposition for user confirmation before dispatch

2. **Task Results View** (NEW — addresses User Advocate BLOCKER #10)
   - New "Tasks" tab in dashboard navigation
   - Shows: active task (with progress), completed tasks, task details
   - Progress indicator: which sub-tasks are done, which are in progress
   - Error communication: clear messages when sub-tasks fail

3. **Approval for All External Actions** (NEW — addresses User Advocate BLOCKER #16)
   - All email sends, CRM updates, social posts, etc. queue for approval
   - Existing approval queue extended with action type labels
   - Default: nothing auto-approved except message responses

4. **Basic Cost Tracking** (addresses Constraint BLOCKER C1)
   - Cost estimate shown before dispatch ("~$X for this task")
   - Per-task token usage tracked
   - Simple monthly total visible in Settings

5. **Task Queue** (addresses Decision 9)
   - Serial processing: one task at a time
   - Queue with position indicator
   - Cancel pending tasks

### Phase 2: Usability

6. Scheduled/recurring tasks
7. Knowledge base management UI
8. Task history with search and filtering
9. Python MCP server (2-3 priority tools, with simple toggle)
10. Notification system (task complete, approval needed)

### Phase 3: Scale

11. Multi-user support (requires storage schema migration)
12. Integration marketplace
13. Full billing/usage dashboard with reports
14. Python MCP server expansion
15. Custom skill creation from dashboard

---

## Implementation Priority (Revised)

### Phase 1: Foundation (MVP)

1. **Skill registry + loader** (Feature 2) — index knowledge-work-plugins, validate schemas, build skill summaries
2. **Task submission UI** — add text input to dashboard home, task confirmation flow
3. **Task results view** — new "Tasks" tab, progress tracking, error display
4. **Agent team dispatch** (Feature 1) — task analysis, skill matching with confidence, team assembly (max 3), CLI-based team launch
5. **Checkpoint system** — persist sub-task results to disk
6. **Approval extension for task actions** — extend vwp-approval to cover all external actions from dispatch
7. **Cost estimation + tracking** — pre-dispatch estimate with confirmation, per-task usage tracking
8. **Task queue** — serial processing with queue management
9. **Lightweight onboarding rewrite** (Feature 3) — 4-step core path, optional enhancements in settings
10. **Single-agent fallback** — run skills sequentially if agent teams unavailable/disabled
11. **Health monitoring** — timeout-based checks, partial failure handling

### Phase 2: Usability (after MVP validation)

12. Scheduled/recurring tasks
13. Knowledge base management UI
14. Task history with search
15. Python MCP server (email + CRM, simple toggle)
16. Notification system
17. Optional onboarding enhancements (knowledge upload, tool connections, skill preferences)

### Phase 3: Scale

18. Multi-user support
19. Integration marketplace
20. Full billing dashboard
21. Python MCP server expansion
22. Custom skill creation

---

## Resolved Open Questions

1. **CLI vs Dashboard?** Both from day 1. CLI uses same dispatch pipeline. Dashboard adds task submission UI.
2. **Maximum team size?** 5 for MVP (1 lead + 4 specialists). Cost estimation + user confirmation prevents runaway.
3. **Custom skill creation?** Phase 3. Not needed for MVP.
4. **Long-running tasks?** Known limitation. Mitigated by checkpoints. Tasks that exceed a single session will produce partial results, not nothing. Documented as limitation.
5. **What about concurrent tasks?** Serial queue for MVP. One task at a time.
6. **What if agent teams break between Claude Code versions?** Single-agent fallback mode runs the same skills sequentially.
