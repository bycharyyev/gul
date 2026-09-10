# Build context is the monorepo root (needs access to packages/*).
FROM node:22-bookworm-slim AS build
RUN corepack enable
WORKDIR /repo

COPY . .
RUN pnpm install --frozen-lockfile

ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN pnpm turbo run build --filter=@topup-hub/admin...

FROM nginx:alpine AS runtime
COPY apps/admin/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/admin/dist /usr/share/nginx/html
EXPOSE 80
