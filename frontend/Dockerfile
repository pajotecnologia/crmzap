# Stage 1: Build da aplicacao React
FROM node:20-alpine AS builder

WORKDIR /app

ENV NODE_OPTIONS="--max-old-space-size=4096"
ENV CI="false"
ENV DISABLE_ESLINT_PLUGIN="true"

COPY package.json package-lock.json* .npmrc ./
RUN npm ci

COPY . .

# Variaveis de build do React (embutidas nos bundles estaticos)
ARG REACT_APP_BACKEND_URL=http://localhost:3000
ENV REACT_APP_BACKEND_URL=$REACT_APP_BACKEND_URL

ARG REACT_APP_LOCAL_MODE=false
ENV REACT_APP_LOCAL_MODE=$REACT_APP_LOCAL_MODE

RUN npm run build

# Stage 2: Servidor Web Nginx ultra-leve
FROM nginx:alpine

COPY --from=builder /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
