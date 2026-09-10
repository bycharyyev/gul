# Build context is the monorepo root (needs access to packages/*).
FROM node:22-bookworm-slim AS build
RUN corepack enable
WORKDIR /repo

COPY . .
RUN pnpm install --frozen-lockfile

ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN pnpm turbo run build --filter=@topup-hub/web...

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
