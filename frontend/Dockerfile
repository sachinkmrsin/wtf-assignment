FROM node:20-alpine AS builder

WORKDIR /app

RUN corepack enable && \
    corepack prepare pnpm@latest --activate

COPY package.json ./

ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}

RUN pnpm install

COPY . .

RUN pnpm build

FROM node:20-alpine AS runtime

RUN npm install -g serve

COPY --from=builder /app/dist /app/dist

EXPOSE 80

CMD ["serve", "-s", "/app/dist", "-l", "80"]
