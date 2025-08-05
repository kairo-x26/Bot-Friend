# Bot-Friend runbooks

Short, do-this-now procedures for operating the API. Background is in [GUIDELINES.md](./GUIDELINES.md).
Every procedure ends with a note in the incident channel saying what you saw, what you did and what's left.

## Suggested alerts

| Alert | Condition (5 min windows unless noted) | Runbook |
|---|---|---|
| Slow first reply | p95 `botfriend_reply_first_delta_seconds` > 4 s for 15 min | [Provider degradation](#provider-outage-or-degradation) |
| Failing replies | `botfriend_replies_total{outcome="failed"}` / all replies > 2% | [Provider degradation](#provider-outage-or-degradation) |
| Blocked output spike | `outcome="blocked_output"` rate 3× the weekly baseline | [Safety incident](#safety-incident) |
| 5xx rate | `botfriend_http_requests_total{status="5xx"}` > 1% | [Rollback](#rollback) |
| Readiness | `/health/ready` failing on more than one instance | [Database](#database-unavailable) |
| Spend | `botfriend_model_cost_micro_usd_total` rate projects past daily budget | [Spend spike](#spend-spike) |
| Deletion jobs | Dashboard "Failed deletion jobs" > 0 for 1 h | [Deletion job failures](#deletion-job-failures) |
| Urgent reports | Open urgent/high reports older than 4 h | [Safety incident](#safety-incident) |

## Provider outage or degradation

Symptoms: `message.failed` with `provider_unavailable`, rising first-delta latency, OpenAI status page incident.

1. Confirm it's upstream: the `chat.reply` spans show errors or long durations, while DB and HTTP latency are normal.
2. Users already see "Bot-Friend couldn't answer just now. Try again." and a retry button. Messages are kept, and
   retries don't cost quota.
3. If latency is the problem, lower `AI_TIMEOUT_MS` (e.g. 15000) so failures are fast and retryable, and consider a
   faster `OPENAI_CHAT_MODEL`. **Only switch to a model that has passed the evals.**
4. For a prolonged full outage, post on the status page and social channels, and leave chat up so retries work the
   moment the provider recovers. Don't switch production to `AI_PROVIDER=mock`.
5. Afterwards: the retention sweep marks any replies stuck in `streaming` as failed within 5 minutes; nothing to clean.

## Moderation outage

Text moderation failures fall back to local patterns automatically (warning log
`Moderation provider unavailable, using local checks only`). Photo messages are refused while image moderation is down.

1. Check how long it has lasted. Short blips need no action.
2. Over 30 minutes: set `FEATURE_IMAGES=false` so the photo button disappears instead of failing, and tell the safety
   lead. Local checks cover self-harm, sexual content involving minors, weapons and some hate patterns, but not
   everything the provider catches.
3. After recovery, sample replies from the outage window in the dashboard (blocked/failed counts) and file anything
   suspicious as a report.

## Spend spike

1. Dashboard overview: estimated spend, messages and active users for the last 24 h. Compare tokens per reply
   against normal.
2. Abuse: look for users near the daily cap with many conversations (admin user lookup). Suspend clear abuse; the
   suspension is audited.
3. Runaway output: check `AI_MAX_OUTPUT_TOKENS` and the prompt version. A prompt change that makes replies longer
   shows up here first.
4. Emergency brake: set `AI_DAILY_BUDGET_USD`. Once it's reached, chat answers "Bot-Friend is taking a short break."
   for everyone until midnight UTC. Lower `QUOTA_*_DAILY` for a softer limit.

## Safety incident

A harmful reply reached users, a report trend shows a pattern, or blocked output spikes.

1. Open the urgent reports in the dashboard (urgent and high priority first). Read the evidence (it's audited).
2. Find the scope: prompt version and model from the report evidence, and the comedy style or game involved.
3. Contain: if a specific style or game is the cause, ship a prompt fix (bump `PROMPT_VERSION`). If it's model
   behavior, roll back `OPENAI_CHAT_MODEL` to the last evaluated model.
4. Add a reproducing case to `evals/datasets/safety.jsonl` (mark `critical: true`), and make sure the fix passes it.
5. Resolve the reports as "actioned" with the eval case id and prompt version in the notes.
6. Self-harm related? Confirm the support path still works end to end: send a test message in staging and check
   for the support card.

## Database unavailable

1. `/health/ready` returns 503 and the load balancer stops routing to unready instances. `/health` (liveness)
   still passes, so instances aren't restarted in a loop.
2. Check the managed Postgres status, connection count (pool max is 10 per instance) and disk.
3. After recovery nothing needs replaying: chat turns are transactional, and in-flight replies are swept to `failed`.
4. Restore from backup only on data loss (targets: RPO 1 h, RTO 4 h). Run migrations on the restored database
   before pointing the API at it (`RUN_MIGRATIONS=true` on boot does this).

## Deletion job failures

1. Dashboard shows failed deletion jobs. The `deletion_jobs` row has `last_error`, `attempts` and per-step progress.
2. The retention sweep retries failed jobs up to 5 attempts. Steps are idempotent, so retrying is always safe.
3. Past 5 attempts: fix the cause (usually a new table missing `ON DELETE CASCADE` or a lock), then reset with
   `UPDATE deletion_jobs SET status = 'failed', attempts = 0 WHERE id = …`. The next sweep picks it up.
4. The user's sessions were revoked at request time, so they can't use the account while this is pending.

## Rollback

1. API: redeploy the previous image tag. Migrations are additive (see GUIDELINES §8), so the previous version runs
   against the newer schema. Never roll back a migration on a live database without a written plan.
2. Prompt-only change: revert the commit and redeploy; replies are tagged with the version they used.
3. Mobile: halt the staged rollout in App Store Connect / Play Console and ship a fix build. (Over-the-air rollbacks
   need `expo-updates`, which isn't set up yet.)

## Capacity and connection limits

- Raise kernel and process limits on API hosts: `net.core.somaxconn >= 4096`, `nofile >= 65536`. The compose
  `app` profile sets both. The API listens with backlog 2048.
- Symptoms of a low accept queue: `ECONNREFUSED`/`EPIPE` from clients during connection bursts while the process
  itself looks healthy. This was reproduced on macOS (`somaxconn` 128) with 1,000 connections in 5 s.
- SSE needs proxies with buffering off (`X-Accel-Buffering: no` is sent) and idle timeouts above 60 s. The API sends
  a keep-alive comment every 15 s.
- Rate limits are per instance unless `REDIS_URL` is set. Set it once you run more than one instance.

## Rotating secrets

- `JWT_SECRET`: rotating signs everyone out (they sign in again; guests resume with their guest token).
- `OPENAI_API_KEY`: rotate in the provider console, update the secret, then restart instances. No user impact.
- `BILLING_WEBHOOK_SECRET`: update the URL in App Store Connect and Play Console in the same change window;
  stores retry failed deliveries.
