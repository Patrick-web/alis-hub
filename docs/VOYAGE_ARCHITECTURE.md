# Voyage Platform Architecture

> Source: `/Users/jp/alis.build/voyage/build/vp` — the `build` repo for the Voyage Charters platform built on Alis.

## What is Voyage?

Voyage is a **yacht charter booking platform** operating primarily in the British Virgin Islands (BVI). It manages the full charter lifecycle: lead generation → quote building → proposal → booking → payment → owner accounting → commissions/referrals.

## The Alis Build System

Alis is a cloud-native development platform. Its build system organises code into:

- **Neurons** — independently deployable microservices (gRPC + Go)
- **Definitions repo** (`define/`) — canonical protobuf contracts
- **Build repo** (`build/`) — Go implementation code
- **CodeBlocks** — composable, pre-vetted template modules ("Golden Paths")

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Language | Go 1.24–1.25 |
| API Protocol | gRPC (protobuf), HTTP for webhooks |
| Database | Google Cloud Spanner (single regional instance, table-prefixed per neuron) |
| Compute | Google Cloud Run (serverless containers) |
| IaC | Terraform (per-neuron `infra/`) |
| Frontend | Vue.js (admin console), Next.js (customer portal), Plasmic (CMS) |
| Email | SendGrid |
| SMS | Twilio |
| Payments | PlacetoPay |
| CRM | HubSpot (bidirectional sync) |
| Task Mgmt | Asana (via Power Automate webhooks) |
| Auth | OAuth 2.0 / OIDC (Google, Microsoft, Apple, LinkedIn) |
| Monitoring | Google Cloud Monitoring + custom issue tracking |

## Key Frameworks & Libraries (Internal)

- `go.alis.build/alog` — structured logging
- `go.alis.build/sproto` — protobuf/Spanner utilities
- `go.alis.build/validation` — input validation
- `go.alis.build/authz` / `go.alis.build/client` — auth & gRPC clients
- `github.com/alis-exchange/go-alis-build/iam/v2` — IAM (role-based, per-RPC authorization)

## Architecture Principles

- **Protobuf as source of truth** — all data models & API contracts start in `.proto` files in the `define/` repo
- **Domain-driven design** — each neuron owns a bounded context (bookings, yachts, payments, etc.)
- **Resource-oriented APIs** — CRUD + List/Stream/Batch on every resource, AIP-compliant naming
- **IAM v2 everywhere** — every RPC authorizes with caller identity propagated via gRPC metadata
- **Soft-delete** — `delete_time` field + `Undelete` RPC on all resources; TTL policies purge after 90 days
- **Single Spanner instance** — all neurons share one database; table names prefixed (e.g. `bookings_v1_Quotes`)
- **h2c multiplexing** — most neurons serve gRPC + HTTP on a single `:8080` port

## Neuron Inventory (28 services)

### Core Domain

| Neuron | Versions | Purpose |
|--------|----------|---------|
| **bookings** | v1, v2 | Quote-to-booking engine. v1 is live; v2 is a normalised rewrite with dual-write migration in-flight |
| **charters** | v1 | Charter offerings (yacht-model + bundles) and capacity |
| **chartertypes** | v1 | Schema for which product categories a charter kind requires (e.g. Crewed, Bareboat) |
| **products** | v1 | Sellable line items (e.g. "Chef Service - Premium") |
| **productcategories** | v1 | Grouping of products with UI selection behaviour (single, multi, quantity) |
| **packages** | v1 | Collects products under a product category |
| **bundles** | v1 | Set of packages forming a charter-type offering |
| **yachts** | v1 | Yachts, models, crew, holds, owner contracts, earnings, owner ledger |
| **yachtowners** | v1 | Owner identity/entity linked to IAM |
| **pricingrules** | v1, v2 | Pricing engine. v2 adds immutable revisions for deterministic audit replay. Dual-write migration in-flight |

### Sales & CRM

| Neuron | Purpose |
|--------|---------|
| **leads** | Pre-booking pipeline: leads, contacts, accounts, cadences, agent on-call rotations |
| **hubspot** | Bidirectional HubSpot sync (quotes, proposals, bookings → Deals, VQuote, VBooking objects) |
| **salesforce** | Early-stage Salesforce integration |

### Financial

| Neuron | Purpose |
|--------|---------|
| **payments** | PlacetoPay gateway: sessions, redirects, webhooks, refunds, booking roll-ups |
| **commissions** | Per-role commission payouts (sales agent, travel agent, broker) with audit revisions |
| **referrals** | Customer referral program state machine + user credit ledger |

### Customer & Admin Portals

| Neuron | Purpose |
|--------|---------|
| **bff** | Stateless Backend-For-Frontend for the admin console; fans out to all domain neurons |
| **console** | Admin dashboard SPA (Vue.js) + Plasmic visual editor |
| **customerportal** | Customer-facing booking portal (Next.js), owner portal, Plasmic CMS |

### Identity

| Neuron | Purpose |
|--------|---------|
| **iam** | OIDC provider + user/group store. Sign-in with Google/Microsoft/Apple/LinkedIn, daily-rotated RSA JWTs |

### Integrations

| Neuron | Purpose |
|--------|---------|
| **sendgrid** | Transactional email with 27+ templates + event webhook tracking |
| **twilio** | SMS messaging |
| **asana** | One-way booking lifecycle events → Asana tasks via Power Automate |

### Support

| Neuron | Purpose |
|--------|---------|
| **experiences** | In-product onboarding/hints/tours + admin authoring SPA |
| **monitoring** | Centralised issue tracking: services post failure signals, dedup, optional Google Chat alerts |
| **reporting** | Read-only analytics (revenue, pipeline, conversion, utilisation) via direct Spanner queries |
| **mockplacetopay** | Test double for PlacetoPay gateway (HTTP mock for dev/integration testing) |
| **alerts** | Terraform-managed Cloud Monitoring alerts + dashboards (infra only, no runtime) |

## Catalog Hierarchy

```
Products → ProductCategories → Packages → Bundles → Charters
                                                         ↓
                                                   CharterTypes
                                                   (defines required categories)
```

## Active Migrations

- **bookings v1→v2**: Normalising monolithic quote blobs into relational tables. Dual-writes, env-flag cutover (`QUOTE_PRIMARY`).
- **pricingrules v1→v2**: Adding immutable `PricingRuleRevision` snapshots for deterministic replay. Dual-writes, env-flag cutover (`PRICING_RULE_PRIMARY`).

## CLI Tools (`scripts/`)

| Tool | Description |
|------|-------------|
| `vp-build` | Local build/deploy pipeline: pack neuron → upload GCS → Cloud Build → Cloud Run deploy |
| `voyage-dbcopy` | Reversible Spanner database copy between environments (Bubble Tea TUI) |
| `script-runner` | TUI to discover & run Go scripts across all services |
| `e2e-runner` | TUI to execute Playwright E2E tests as Cloud Run jobs |

## Pre-commit Hooks

- **`check-port-8080.sh`** — blocks non-8080 ports in `server.go` / `cloudrun.tf`
- **`check-no-localhost-urls.sh`** — blocks `localhost`/`127.0.0.1` in service connection URLs (excludes tests, scripts, mocks)

## Docs Site

A VitePress site aggregates developer docs from across the monorepo. Generates service topology diagrams, sidebar from filesystem, and git-based author/date attribution.

## Key Observations for Reverse Engineering

1. **Single Spanner DB** — all services share a database; the `reporting` neuron reads sibling tables directly (no gRPC). Schema coupling is tight.
2. **Universal `ResourceTable[T]` pattern** — most catalog services use identical CRUD + IAM patterns. Learn one, know most.
3. **Protobuf is mandatory** — any new data model or API surface must start with `.proto` definitions. The `define/` repo is the contract.
4. **Migration approach** — dual-writes with env-flag cutover, not blue-green deploys. Both v1 and v2 services run simultaneously.
5. **IAM is everywhere** — all inter-service calls carry identity. The BFF and console proxy `x-user-id` / `x-user-email` / `x-user-policy` via gRPC metadata.
6. **Soft-delete + TTL** — all resources. 90-day retention, `show_deleted` query param to list, `Undelete` RPC to restore.
