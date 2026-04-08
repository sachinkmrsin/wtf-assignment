FROM node:20-alpine AS builder

WORKDIR /app

RUN corepack enable && \
    corepack prepare pnpm@latest --activate

COPY package.json ./
RUN pnpm install

COPY tsconfig.json ./
COPY src ./src

RUN pnpm build

# ── Runtime stage ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

WORKDIR /app

RUN corepack enable && \
    corepack prepare pnpm@latest --activate

COPY package.json ./
RUN pnpm install --prod && \
    rm -rf ~/.pnpm-store /root/.cache /root/.local

COPY --from=builder /app/dist ./dist

EXPOSE 3001

CMD ["node", "dist/app.js"]
