# CRM — Código-fonte

Monorepo com:

- `frontend/` — React (CRA + craco), roda na porta **5090**
- `backend/` — Node.js + Express + Sequelize (PostgreSQL), porta **3000**
- `api_oficial/`, `mcp-server/`, `tools/`, `vercel-email-worker/` — serviços opcionais

Requisitos: **Node.js 20+**. Para o modo com banco: **PostgreSQL** e **Redis**.

## 1. Instalação

```bash
npm run install:all
```

## 2. Modo local (sem banco de dados)

O frontend já vem com `REACT_APP_LOCAL_MODE=true` em `frontend/.env`. Nesse modo todos os
dados ficam salvos no `localStorage` do navegador e nenhum backend é necessário.

```bash
npm run dev
```

Acesse http://localhost:5090 e entre com:

- **E-mail:** `admin@local.dev`
- **Senha:** `123456`

## 3. Modo com banco de dados (produção)

1. Copie `backend/.env.example` para `backend/.env` e preencha `DB_*` (ou `DATABASE_URL`),
   `JWT_SECRET`, `JWT_REFRESH_SECRET` e o Redis.
2. Crie todas as tabelas no banco configurado (um único comando):

   ```bash
   cd backend
   npx sequelize db:migrate
   # ou, para criar tabelas + dados iniciais:
   npm run db:setup
   ```

   As migrations também criam o usuário administrador `admin@local.dev` / `123456`
   (troque a senha depois do primeiro acesso).
3. Em `frontend/.env`, defina `REACT_APP_LOCAL_MODE=false` e `REACT_APP_BACKEND_URL`
   com a URL do backend.
4. Suba os serviços:

   ```bash
   npm run dev:backend
   npm run dev
   ```

## Variáveis de ambiente

Os arquivos `.env.example` de `backend/` e `frontend/` listam todas as variáveis, sem
nenhum valor real. Chaves de IA (OpenAI, Claude, Gemini, Grok) e conexões (WhatsApp,
Instagram, Facebook, Telegram, e-mail) são configuradas por empresa na página **Conexões**.
