# Build from the repo root:  docker build -f apps/api/Dockerfile -t bot-friend-api .
FROM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @bot-friend/api... --filter @bot-friend/shared
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @bot-friend/shared build && pnpm --filter @bot-friend/api build
RUN pnpm --filter @bot-friend/api deploy --prod /out

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /out/package.json ./
COPY --from=build --chown=app:app /out/node_modules ./node_modules
COPY --from=build --chown=app:app /out/dist ./dist
COPY --from=build --chown=app:app /out/drizzle ./drizzle
USER app
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s CMD wget -qO- http://127.0.0.1:4000/health || exit 1
CMD ["node", "--import", "./dist/telemetry.js", "dist/main.js"]
