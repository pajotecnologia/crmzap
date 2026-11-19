# Worker de e-mail (relay SMTP)

## O que isso resolve

Algumas hospedagens bloqueiam as portas SMTP (25, 465 e 587). Este projeto é um
**mini-servidor HTTPS**: o backend chama este endereço pela porta 443 e **aqui** o
Node abre a conexão SMTP real com Nodemailer.

Você continua usando Gmail, Outlook ou outro SMTP, com as credenciais cadastradas no
sistema em **Integrações → E-mail**.

## Passo a passo

### 1) Gere um segredo forte

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Esse valor será o `EMAIL_SMTP_RELAY_SECRET` (igual no worker e no backend).

### 2) Publique esta pasta

Na Vercel (ou em outra hospedagem que rode funções Node.js):

1. **Add New → Project** e importe o repositório.
2. **Root Directory:** `vercel-email-worker` · **Framework Preset:** `Other`.
3. Em **Environment Variables**, crie `EMAIL_SMTP_RELAY_SECRET` com o segredo do passo 1.
4. Faça o deploy e anote a URL pública (ex.: `https://seu-worker.vercel.app`).

### 3) Aponte o backend para o worker

Nas variáveis de ambiente do servidor do backend (VPS, cPanel, Railway, Render etc.):

```
EMAIL_SMTP_RELAY_URL=https://seu-worker.vercel.app
EMAIL_SMTP_RELAY_SECRET=o_mesmo_segredo_do_worker
```

Reinicie o backend depois de salvar.

### 4) Teste

- `https://seu-worker.vercel.app/api/health` deve responder `{ "ok": true }`.
- Envie um e-mail pelo sistema: o backend usará `POST /api/send-mail` no worker.

## Segurança

- Sem o header `Authorization: Bearer <segredo>`, o worker responde **401**.
- O corpo da requisição contém a senha SMTP: use apenas **HTTPS** e um segredo longo.
- Nunca faça commit de `.env` com o segredo.

## Limites

- Tempo máximo por função de cerca de 60 s; anexos grandes podem falhar.
- Limite de tamanho do corpo da requisição (~4,5 MB na Vercel).

## Endpoints

| Rota | Função |
|------|--------|
| `GET/POST /api/health` | Healthcheck `{ ok: true }` |
| `POST /api/verify-smtp` | Verifica as credenciais SMTP enviadas |
| `POST /api/send-mail` | Envia o e-mail (HTML, texto e anexos em base64) |

Todos (exceto health) exigem `Authorization: Bearer <EMAIL_SMTP_RELAY_SECRET>`.
