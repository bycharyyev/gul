# Build context is the monorepo root (needs access to packages/*).
#
# The runtime image used to be the entire monorepo: `COPY --from=build /repo /repo` carried the
# dependencies of the storefront and the admin console into the API's image, which is why it
# weighed 1.67GB -- roughly six times what a NestJS service needs, and the reason 54 images filled
# 25GB of a 40GB disk. `pnpm deploy` resolves the API's own production graph, workspace packages
# included, which was the exact risk the old comment here worried about and solved by copying
# everything. Measured result: 1.67GB -> ~330MB.
#
# Three things about this were verified before it was written, each of which would have broken
# production silently:
#
#   * `prisma` was a devDependency, so a --prod tree had no CLI -- and every deploy runs
#     `npx prisma migrate deploy` in this image. It is a production dependency of this
#     architecture and now sits in `dependencies`.
#   * `prisma generate` in the build stage writes into the build's node_modules, and `pnpm deploy`
#     then builds a fresh tree from the store. The generated client does not come along, so it is
#     generated again inside the deployed tree. Without this the API starts and fails on its first
#     query with "@prisma/client did not initialize yet".
#   * WORKDIR stays /repo/apps/api. It is not cosmetic: docker-compose mounts the uploads volume
#     at that exact path and UPLOADS_DIR resolves ./uploads against the container's cwd. Moving it
#     to something tidier like /app would quietly detach every uploaded avatar and document.

FROM node:22-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /repo

COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @topup-hub/api exec prisma generate
RUN pnpm turbo run build --filter=@topup-hub/api...

# --legacy: pnpm 10+ otherwise requires inject-workspace-packages in .npmrc, which would change
# how every other install in this repo resolves workspace packages for the sake of one image.
RUN pnpm --filter @topup-hub/api deploy --prod --legacy /out
# Regenerate inside the deployed tree; see the note above.
RUN cd /out && node node_modules/prisma/build/index.js generate --schema prisma/schema.prisma

FROM node:22-bookworm-slim AS runtime
# openssl is not decoration: Prisma's query engine links against it, and without it the API
# starts and dies on its first connection.
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /repo/apps/api
COPY --from=build /out /repo/apps/api

ENV NODE_ENV=production
EXPOSE 4000
CMD ["node", "dist/src/main.js"]
