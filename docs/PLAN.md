# Bot-Friend build plan

Source of truth: `Bot-Friend_Product_Requirements.md` (PRD). This plan turns it into
an ordered set of buildable stages. Each stage ends with tests passing and a commit.

## Repository layout

```
bot-friend/
├── apps/
│   ├── api/        NestJS + Fastify modular monolith (REST + SSE streaming)
│   ├── mobile/     Expo + Expo Router + TypeScript (iOS / Android / web preview)
│   └── admin/      Vite + React moderation/support dashboard
├── packages/
│   └── shared/     zod API contracts, stream event types, error codes, design tokens
├── evals/          AI regression datasets + evaluation harness
├── docs/           plan, architecture, guidelines, runbooks
└── docker-compose.yml   Postgres + Redis for local development
```

pnpm workspaces. TypeScript everywhere. Vitest for the api/shared/admin, jest-expo +
React Native Testing Library for mobile, Playwright for admin end-to-end.

## Key technical decisions

| Topic | Decision | Why |
|---|---|---|
| ORM | Drizzle ORM on `pg` | Typed SQL, plain migrations, no codegen step |
| Test database | PGlite (Postgres compiled to WASM) | Real Postgres semantics in tests without Docker |
| Auth | App-issued session JWT (jose). Guest sessions + Apple/Google ID tokens verified against provider JWKS. `dev` provider only when `AUTH_DEV_LOGIN=true` | Matches "Supabase Auth or equivalent OIDC" while staying self-contained |
| AI | `AiProvider` interface; `OpenAiProvider` (Responses API, `store: false`) + deterministic `MockProvider` for tests/offline dev | Model-agnostic, testable |
| Streaming | `POST …/messages/stream` returning `text/event-stream` with `message.started/delta/completed/blocked/failed` | PRD §10 contract |
| Output safety | Sentence-level buffered release: deltas are held until a sentence boundary passes incremental moderation; full reply moderated before `completed` | PRD §13 streaming safety |
| Quotas | `QuotaService` backed by Postgres usage counters, rate limiter with pluggable store (memory / Redis) | BF-017 |
| Mascot | SVG + Reanimated blob with expression states (Rive optional later) | No external `.riv` asset needed, fully themeable |
| Mobile streaming | `expo/fetch` streaming body reader with SSE parser | RN core fetch has no streaming body |

## Stages

### Stage 0 — Foundation
1. Workspace scaffolding: pnpm workspace, base tsconfig, prettier, editorconfig, gitignore.
2. `packages/shared`: error codes, zod schemas for every endpoint, stream event union, design tokens.

### Stage 1 — Backend core (PRD §10, §11)
3. NestJS + Fastify app, typed config, `/health`, request IDs, stable error envelope.
4. Database schema + migrations for all MVP entities (§9), PGlite test harness.
5. Identity: guest/dev/Apple/Google sessions, JWT guard, age eligibility (BF-002, BF-003).
6. `/v1/me`, `/v1/me/preferences` (BF-008, BF-011).
7. Conversations: create/list/get/delete, cursor pagination, ownership checks (BF-006, BF-016).

### Stage 2 — AI chat (PRD §12)
8. Prompt layering + personality contracts (wholesome/chaotic/sarcastic/chill) with versioning.
9. AI providers (OpenAI Responses + mock), bounded history window.
10. Streaming endpoint: idempotency keys, retry without duplication, cancellation (BF-004/005/007).
11. Suggestions + humor modes: jokes, stories, opt-in roasts with boundaries (BF-009, BF-012).

### Stage 3 — Safety, limits, operations
12. Moderation of input and output, distress detection that exits comedy (BF-014).
13. Quotas + rate limits, `/v1/usage`, usage records with cost estimates (BF-017).
14. Reports, account deletion workflow, audit events (BF-015, BF-016).
15. Admin API: report queue, resolution, user lookup, audit trail (BF-018).
16. Mini-game engine: Joke Battle + Roast Me + Would-You-Rather (BF-013).

### Stage 4 — Mobile app (PRD §4)
17. Expo app scaffold, fonts, theme provider (light + designed dark), reduced motion.
18. Component library: Text, Button, Chip, Surface, Icon, Sheet; mascot with expressions.
19. Onboarding: welcome → AI disclosure + age gate → personality → sign-in/guest.
20. API client, auth store, TanStack Query.
21. Chat screen: bubbles, streaming render, stop, retry, suggestion chips, message menu (report/react).
22. Conversation list/history, delete.
23. Play tab: game launcher + in-chat game flow.
24. Customize tab: personality studio (style, energy, boundaries, mascot colors).
25. Profile tab: theme, accessibility, privacy, usage, account deletion.

### Stage 5 — Admin dashboard
26. Vite + React app: login (admin token), report queue, report detail, resolve, audit log.
27. Playwright tests against a mocked API.

### Stage 6 — Phase 2 features (PRD "Should")
28. Long-term memories with consent + controls (BF-019, BF-020).
29. Conversation search (BF-021), reactions/feedback (BF-023).
30. Data export (BF-026), reminder preferences (BF-024), billing webhook + entitlements skeleton (BF-025).
31. Voice: realtime client-secret endpoint + voice screen UI (BF-022, flagged off by default).

### Stage 7 — Quality and release
32. AI evaluation harness with datasets for personality, safety, robustness, humor score Q.
33. Load-test script (autocannon) for streaming + rate limits.
34. Dockerfile, docker-compose, GitHub Actions CI, EAS config.
35. Guidelines: architecture, dev setup, conventions, testing, safety, release runbooks.

## Definition of done per stage
- `pnpm -r typecheck` and `pnpm -r test` pass.
- New behaviour has tests; bug fixes get a regression test.
- Mobile screens checked in the web preview at phone width in light and dark.
