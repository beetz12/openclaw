# VWP Assignment Endpoints (Phase A)

Base: `http://localhost:19001`
Auth: `Authorization: Bearer <gateway-token>`

## 1) Manual assign

`POST /vwp/dispatch/tasks/:id/assign`

### Body

```json
{
  "agentId": "eng-1",
  "role": "Engineering",
  "requiredSkills": ["typescript", "testing"],
  "mode": "manual-lock",
  "reason": "David manually assigned"
}
```

### Response

```json
{
  "id": "<task-id>",
  "assignment": {
    "assignedAgentId": "eng-1",
    "assignedRole": "Engineering",
    "requiredSkills": ["typescript", "testing"],
    "assignmentMode": "manual-lock",
    "assignmentReason": "David manually assigned",
    "executorAgentId": null,
    "executionProfile": null
  }
}
```

## 2) Auto-assign

`POST /vwp/dispatch/tasks/:id/auto-assign?role=marketing&skills=seo,linkedin`

If query params omitted, endpoint uses existing task assignment hints.

### Response

```json
{
  "id": "<task-id>",
  "assignment": { "...": "current persisted assignment" },
  "explain": {
    "assignedAgentId": "mkt-1",
    "assignedRole": "Marketing",
    "requiredSkills": ["seo", "linkedin"],
    "assignmentMode": "auto",
    "assignmentReason": "Best score: Marketing",
    "scoreBreakdown": [
      {
        "agentId": "mkt-1",
        "score": 10,
        "reasons": ["role match +5", "skills match +3", "load bonus +2"]
      }
    ]
  }
}
```

## 3) Unlock assignment

`POST /vwp/dispatch/tasks/:id/unlock-assignment`

### Response

```json
{
  "id": "<task-id>",
  "assignment": {
    "assignmentMode": "auto",
    "assignmentReason": "Unlocked by user"
  }
}
```

## 4) Explain current assignment decision

`GET /vwp/dispatch/tasks/:id/assignment-explain`

### Response

```json
{
  "id": "<task-id>",
  "assignment": { "...": "persisted assignment" },
  "explain": { "...": "decision preview + scoreBreakdown" }
}
```

## Notes

- `manual-lock` mode is preserved by auto-assign until explicitly unlocked.
- Task detail endpoint includes assignment payload:
  - `GET /vwp/dispatch/tasks/:id`
- Assignment profile file stored per task at:
  - `~/.openclaw/vwp/tasks/<task-id>/assignment.json`
