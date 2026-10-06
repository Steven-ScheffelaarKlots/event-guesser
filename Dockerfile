# Chronodle: the game on :3000 and the admin on :3001, both served by the API process.
# Needs Postgres via DATABASE_URL; see deploy/docker-compose.yml.

FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/game/package.json apps/game/
COPY apps/admin/package.json apps/admin/
COPY packages/shared/package.json packages/shared/
RUN npm ci
COPY . .
RUN npm run build -w @chronodle/game -w @chronodle/admin

FROM node:24-alpine
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    ADMIN_PORT=3001
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/game/package.json apps/game/
COPY apps/admin/package.json apps/admin/
COPY packages/shared/package.json packages/shared/
RUN npm ci --omit=dev -w @chronodle/api && npm cache clean --force
COPY packages/shared/src packages/shared/src
COPY apps/api/src apps/api/src
COPY apps/api/drizzle apps/api/drizzle
COPY --from=build /app/apps/game/dist apps/game/dist
COPY --from=build /app/apps/admin/dist apps/admin/dist
USER node
EXPOSE 3000 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO /dev/null http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "--import", "tsx", "apps/api/src/server.ts"]
