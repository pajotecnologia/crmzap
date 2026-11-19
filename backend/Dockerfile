# Build sem usar secrets no build (FACEBOOK_APP_SECRET etc. só em runtime)
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* .npmrc ./
RUN npm ci

RUN mkdir -p public
COPY . .
RUN npm run build

# Imagem final: dist + public (logo, fotos de perfil que estiverem no repo)
FROM node:20-alpine

WORKDIR /app

# ffmpeg do sistema — ffmpeg-static costuma falhar no Alpine (musl)
RUN apk add --no-cache ffmpeg

COPY package.json package-lock.json* .npmrc ./
# typescript fica em dependencies (migrations .ts via ts-node no start).
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/src/database/migrations ./src/database/migrations
COPY --from=builder /app/src/database/seeds ./src/database/seeds
COPY --from=builder /app/src/models ./src/models
COPY --from=builder /app/config ./config
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/.sequelizerc ./.sequelizerc

# Garante que o ts-node execute migrations e seeds com CommonJS sem erro de moduleResolution
ENV TS_NODE_TRANSPILE_ONLY=true
ENV TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","moduleResolution":"node"}'

EXPOSE 3000

CMD ["sh", "-c", "NODE_ENV=production npm run db:migrate && NODE_ENV=production npm run db:seed && NODE_ENV=production node dist/server.js"]
