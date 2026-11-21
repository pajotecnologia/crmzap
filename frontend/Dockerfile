# Stage 1: Build da aplicacao React (usando Debian slim para melhor gerenciamento de memoria com Webpack/CRA)
FROM node:20-slim AS builder

WORKDIR /app

# Otimizacoes criticas de memoria e build
ENV NODE_OPTIONS="--max-old-space-size=1536"
ENV CI="false"
ENV DISABLE_ESLINT_PLUGIN="true"
ENV GENERATE_SOURCEMAP="false"
ENV INLINE_RUNTIME_CHUNK="false"

# Copia dependencias e scripts de correcao antes do install
COPY package.json package-lock.json* .npmrc ./
COPY scripts ./scripts
RUN npm ci

# Copia o codigo fonte
COPY . .

# Variaveis de build do React (embutidas no bundle estatico)
ARG REACT_APP_BACKEND_URL=http://localhost:3000
ENV REACT_APP_BACKEND_URL=$REACT_APP_BACKEND_URL

ARG REACT_APP_LOCAL_MODE=false
ENV REACT_APP_LOCAL_MODE=$REACT_APP_LOCAL_MODE

RUN npm run build

# Stage 2: Servidor Web Nginx ultra-leve
FROM nginx:alpine

COPY --from=builder /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Script do docker-entrypoint para gerar env-config.js em runtime
RUN printf '#!/bin/sh\ncat <<EOF > /usr/share/nginx/html/env-config.js\nwindow.ENV = {\n  REACT_APP_BACKEND_URL: "${REACT_APP_BACKEND_URL:-${BACKEND_URL:-}}",\n  REACT_APP_LOCAL_MODE: "${REACT_APP_LOCAL_MODE:-false}"\n};\nEOF\n' > /docker-entrypoint.d/40-generate-env.sh && \
    chmod +x /docker-entrypoint.d/40-generate-env.sh

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
