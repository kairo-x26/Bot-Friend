# Bot-Friend

**Your favorite little weirdo, powered by AI.** A humor-first AI companion for adults on iOS and Android: natural
conversation, four comedy styles, an animated mascot, mini-games, and real privacy and safety controls.

| | |
|---|---|
| `apps/mobile` | Expo SDK 58 app (iOS, Android, web preview) |
| `apps/api` | NestJS + Fastify API, PostgreSQL (Drizzle), OpenAI Responses/Moderation/Realtime |
| `apps/admin` | Moderation and support dashboard |
| `packages/shared` | API contracts, streaming events, design tokens |
| `evals` | AI regression suite and streaming load test |

## Quick start (no Docker, no API key)

```bash
pnpm install
pnpm --filter @bot-friend/shared build

# API with embedded Postgres and the offline mock AI
cd apps/api && pnpm build && DATABASE_EMBEDDED=true AUTH_DEV_LOGIN=true pnpm start
# in another terminal: the app in a browser
pnpm --filter @bot-friend/mobile web
```

Use real Postgres with `docker compose up -d postgres redis` and real replies with `AI_PROVIDER=openai` plus
`OPENAI_API_KEY` in `apps/api/.env` (see `apps/api/.env.example`).

## Everyday commands

```bash
pnpm -r typecheck                              # all packages
pnpm -r test                                   # unit + integration tests
pnpm --filter @bot-friend/admin test:e2e       # Playwright
pnpm --filter @bot-friend/evals eval --offline # AI evals against a running API (mock provider)
pnpm format                                    # prettier
```

## Docs

- [Engineering guidelines](docs/GUIDELINES.md): architecture, conventions, safety and privacy rules, design
  system, testing, release, requirement coverage
- [Runbooks](docs/RUNBOOKS.md): alerts and incident procedures
- [Build plan](docs/PLAN.md)
- [Product requirements](Bot-Friend_Product_Requirements.md)

Bot-Friend is an AI. It can be wrong, and it is not a substitute for professional help.
