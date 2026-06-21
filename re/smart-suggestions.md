# Smart Suggestions / Smart Workflows — Design Discussion

## Concept

Introduce context-aware suggestions that surface relevant next actions to developers based on what they're currently doing in alis hub. Triggered by detected state changes (file edits, build results, deploys, etc.) rather than user input.

This is an **alis hub Labs** feature — users can enable/disable individual suggestions independently.

---

## User's Initial Ideas

- Auto-suggest committing define repo changes when they're detected
- Suggest updating specific neurons that consume a recently defined service

---

## Suggestion Interaction Model

- **Passive** — appears in a panel/strip; user acts when ready. Triggered by a completed action or detected state.
- **Interruptive** — fires when the user is about to do something potentially wrong or incomplete. Requires acknowledgement before proceeding.

Design principle: *interruptive = user is about to do something that may be wrong or incomplete; passive = here's a useful next step when you're ready.*

---

## Full Suggestion Catalogue (brainstormed)

### Post-Define
| Suggestion | Type |
|---|---|
| After editing a `.proto` file, suggest running `buf lint` / `buf breaking` before committing | Passive |
| After a breaking change is detected in a proto, surface affected neurons and suggest a migration plan | Interruptive |
| After defining a new RPC, suggest scaffolding the handler stub in the implementing neuron | Passive |

### Build Chain
| Suggestion | Type |
|---|---|
| After a successful neuron build, suggest deploying to dev | Passive |
| After a failed build, offer to re-run with verbose output or open the relevant log | Passive |
| If a build hasn't run since the last code change, intercept a deploy attempt and suggest building first | Interruptive |

### Cross-Neuron Dependency
| Suggestion | Type |
|---|---|
| When a neuron's dependency is updated and deployed, suggest rebuilding downstream consumers | Passive |
| Detect when a neuron is consuming a deprecated API version and suggest upgrading | Passive |

### Environment Hygiene
| Suggestion | Type |
|---|---|
| Detect when local proto definitions are ahead of committed state and suggest committing | Passive |
| When switching orgs/products, detect uncommitted work and prompt before context switch | Interruptive |
| After a long idle period, suggest pulling latest changes to avoid divergence | Passive |

### Release Readiness
| Suggestion | Type |
|---|---|
| After all neurons are green in staging, suggest promoting to prod as a batch | Passive |
| Detect when changelog or release notes haven't been updated after significant changes | Passive |

---

## Shared Infrastructure

Each suggestion depends on one or more of these building blocks:

| ID | Infrastructure | Complexity | Notes |
|---|---|---|---|
| A | Git status/diff polling | Low | Shell calls from Go/Wails, no new system needed |
| B | File watcher | Medium | `fsnotify` on Go side, watch proto/code dirs |
| C | Build/deploy event hooks | Low-Medium | PTY/notification system likely already emits these; make them hookable |
| D | Neuron dependency graph | High | Heaviest lift — data model + population strategy |

---

## Feasibility Check

### Post-Define
| Suggestion | Needs | Feasibility |
|---|---|---|
| After editing proto, suggest buf lint/breaking | B | Medium — file watcher + invoke buf CLI |
| Breaking change detected, surface affected neurons | B + buf CLI parsing + D | Hard — needs graph to know who's affected |
| New RPC defined, suggest scaffolding handler stub | B + proto diff parsing + D + code gen | Hard — most complex of all |

### Build Chain
| Suggestion | Needs | Feasibility |
|---|---|---|
| After successful build, suggest deploy to dev | C | Easy — build result already flows through PTY/notifications |
| After failed build, offer verbose re-run | C | Easy — same signal, different action |
| Build not run since last change, intercept deploy | B + C + deploy action hook | Medium — track last-build vs last-change timestamps |

### Cross-Neuron Dependency
| Suggestion | Needs | Feasibility |
|---|---|---|
| Dependency updated + deployed, suggest rebuilding consumers | D + C | Hard — fully blocked on dependency graph |
| Consuming deprecated API version, suggest upgrading | D + API metadata | Hard — needs graph + deprecation info in proto metadata |

### Environment Hygiene
| Suggestion | Needs | Feasibility |
|---|---|---|
| Local protos ahead of committed state, suggest commit | A | Easy — git status on the define repo |
| Switching orgs/products, detect uncommitted work | A + navigation hook | Medium — git status is trivial, hooking into the switcher is the work |
| After long idle, suggest pulling latest | A + idle timer | Easy — timer + git fetch check |

### Release Readiness
| Suggestion | Needs | Feasibility |
|---|---|---|
| All neurons green in staging, suggest prod batch promote | D + aggregated health data | Hard — needs graph + cross-neuron status aggregation |
| Changelog not updated after significant changes | A + change significance heuristic | Medium — git diff on changelog is easy; "significant" threshold is fuzzy (Gemma helps later) |

---

## Summary Tiers

| Tier | Suggestions | Gate |
|---|---|---|
| **Easy** | Suggest deploy after build, verbose re-run after failure, detect uncommitted protos, idle pull suggestion | Just A or C |
| **Medium** | buf lint suggestion, intercept deploy without build, org/product switch check, changelog check | Needs B or navigation hook |
| **Hard** | Breaking change impact, RPC scaffolding, downstream rebuild, deprecated API detection, staging-to-prod batch promote | All require D (dependency graph) |

> The dependency graph (D) is the gate for the most powerful suggestions and should be a dedicated milestone, not a prerequisite for shipping v1.

---

## What Needs to Be Built

1. **File watchers / git diff access** — runtime detection of local changes
2. **Neuron dependency graph** — data model mapping which neurons consume which defined services
3. **Suggestion surface** — where suggestions appear (status strip, dedicated panel, or toast/notifications)

---

## Gemma 4 Local Model (Layer 2 — future)

A small local Gemma 4 model can be layered in later to enhance suggestions. Key constraint: small context window, so it must receive pre-digested inputs, not raw files.

### Where it adds value
| Task | How |
|---|---|
| Commit message generation | Feed diff summary → generate conventional commit message |
| Breaking change classification | Feed proto field diff → classify: breaking / non-breaking / additive |
| Suggestion relevance ranking | Feed last 3 user actions + pending suggestions → pick most contextually appropriate |
| Natural language trigger definition | Users define suggestions in plain English; model interprets when the condition is met |
| Change impact summary | Generate human-readable explanation for why a suggestion fired |

### Where it won't help
- Understanding full proto files or large codebases
- Cross-file dependency resolution (needs the graph)
- Anything requiring long historical context

### Design principle
Use the **dependency graph + file watchers for detection**, Gemma for **framing** — turning raw signals into ranked, human-readable suggestions.

---

## UI Decisions

### Passive surface
A **floating bubble** that sits persistently in the workspace corner showing a pending suggestion count. Clicking it opens a **Suggestions panel** that lists all active suggestions. The bubble keeps suggestions visible without occupying permanent layout space.

### Labs settings
Grouped by category in the Labs settings UI:
- **Define** — proto/buf related suggestions
- **Build & Deploy** — build chain suggestions
- **Environment Hygiene** — git/workspace state suggestions
- **Release Readiness** — staging/prod and changelog suggestions

Each group is collapsible; each suggestion within it has an individual toggle + short description.

---

## Phased Rollout

### Phase 1 — Labs foundation + Easy wins
- Build Labs settings UI (grouped, per-suggestion toggles)
- Build floating bubble + suggestions panel surface
- Ship 4 easy suggestions: suggest deploy after build, verbose re-run after failure, detect uncommitted protos, idle pull suggestion
- Goal: prove the UX pattern with zero new detection infrastructure

### Phase 2 — File watcher + Medium suggestions
- Add `fsnotify`-based file watching on Go side
- Hook into org/product switcher for navigation guard
- Ship: buf lint suggestion, deploy interception, switch guard, changelog check
- Nail down the interruptive UX treatment (inline warning banner in action flow)

### Phase 3 — Dependency graph + Hard suggestions
- Design and build the neuron dependency graph as a standalone milestone
- Wire up all 5 hard suggestions against the graph
- Natural point to layer in Gemma 4 for framing and ranking

---

## Next Steps

- [ ] ~~Feasibility check on each suggestion~~ ✓
- [ ] ~~Decide on the suggestion surface~~ ✓ floating bubble → suggestions panel
- [ ] ~~Labs settings structure~~ ✓ grouped by category
- [ ] Design the floating bubble + suggestions panel UI
- [ ] Define the Labs settings schema
- [ ] Start Phase 1 implementation
- [ ] Design the dependency graph data model (Phase 3 prereq)
- [ ] Gemma integration design (deferred to Phase 3)
