# One image: the API, serving the built web app on the same address.
#
# Build for the x86 machines AWS runs it on, even from an Apple Silicon Mac:
#   docker build --platform linux/amd64 -t for-wealth .

# --- Build the web app -------------------------------------------------------
# Runs on the machine doing the build (no emulation): the output is plain
# HTML, CSS and JS, the same on any platform.
FROM --platform=$BUILDPLATFORM node:24-slim AS web
RUN npm install --global pnpm@12.11.2
WORKDIR /app

# Package files first, so the install is cached until a dependency changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter @for-wealth/web run build

# --- Run the API -------------------------------------------------------------
FROM node:24-slim
RUN npm install --global pnpm@12.11.2
WORKDIR /app
ENV NODE_ENV=production

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
# Only the API and what it depends on, without dev tools.
RUN pnpm install --frozen-lockfile --prod --filter "@for-wealth/api..."

COPY packages/shared/src packages/shared/src
COPY apps/api/src apps/api/src
COPY --from=web /app/apps/web/dist apps/web/dist

ENV PORT=3000 \
    WEB_DIST_DIR=/app/apps/web/dist
EXPOSE 3000
USER node
WORKDIR /app/apps/api
# node itself, not pnpm, so it receives the stop signal and shuts down cleanly.
CMD ["node", "--import", "tsx", "src/index.ts"]
