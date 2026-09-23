# Build context is the monorepo root (needs access to packages/*).
FROM node:22-bookworm-slim AS build
RUN corepack enable
WORKDIR /repo

COPY . .
RUN pnpm install --frozen-lockfile

ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
# Optional: unset means Analytics (components/analytics.tsx) renders nothing for that provider.
ARG NEXT_PUBLIC_GA_ID
ENV NEXT_PUBLIC_GA_ID=$NEXT_PUBLIC_GA_ID
ARG NEXT_PUBLIC_YM_ID
ENV NEXT_PUBLIC_YM_ID=$NEXT_PUBLIC_YM_ID
ARG NEXT_PUBLIC_SENTRY_DSN
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN
# --mount=type=secret,env=... isn't supported by every buildx version (failed on the GitHub
# runner with "unexpected key 'env'") -- the portable form mounts the secret as a FILE at
# /run/secrets/<id> and this exports it into the shell's own env for that one RUN layer, so it
# still never becomes an ARG/ENV and never lands in an image layer or `docker history`.
RUN --mount=type=secret,id=SENTRY_AUTH_TOKEN \
    export SENTRY_AUTH_TOKEN="$(cat /run/secrets/SENTRY_AUTH_TOKEN)" && \
    pnpm turbo run build --filter=@topup-hub/web...

# Next "standalone" output already traces + prunes only the deps it needs.
FROM node:22-bookworm-slim AS runtime
WORKDIR /repo
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
# `output: "standalone"` traces server dependencies but does NOT include public/ -- it has to be
# copied explicitly. This went unnoticed while public/ was empty; the moment brand assets landed
# there they 404'd in production while serving fine in dev.
COPY --from=build /repo/apps/web/public ./apps/web/public

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
