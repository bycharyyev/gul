# Build context is the monorepo root (needs access to packages/*).
FROM node:22-bookworm-slim AS build
RUN corepack enable
WORKDIR /repo

COPY . .
RUN pnpm install --frozen-lockfile

ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
ARG VITE_SENTRY_DSN
ENV VITE_SENTRY_DSN=$VITE_SENTRY_DSN
# --mount=type=secret,env=... isn't supported by every buildx version (failed on the GitHub
# runner with "unexpected key 'env'") -- the portable form mounts the secret as a FILE at
# /run/secrets/<id> and this exports it into the shell's own env for that one RUN layer, so it
# still never becomes an ARG/ENV and never lands in an image layer or `docker history`.
RUN --mount=type=secret,id=SENTRY_AUTH_TOKEN \
    export SENTRY_AUTH_TOKEN="$(cat /run/secrets/SENTRY_AUTH_TOKEN)" && \
    pnpm turbo run build --filter=@topup-hub/admin...

FROM nginx:alpine AS runtime
COPY apps/admin/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/admin/dist /usr/share/nginx/html
EXPOSE 80
