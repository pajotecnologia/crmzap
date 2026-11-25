# 🚀 Manual de Instalação no Coolify — Pajo CRM

Este é o guia definitivo com o **caminho mais rápido e à prova de falhas** para colocar o **Pajo CRM** em produção no **Coolify**, com **PostgreSQL**, **Redis**, backend e frontend integrados.

---

## 📋 1. Pré-Requisitos

1. **Servidor VPS com Coolify v4 instalado**:
   * Recomendado: 2 vCPUs e 4 GB de RAM.
   * **Memória Swap**: Ter pelo menos 2 a 4 GB de Swap configurado na VPS (o build do frontend React é pesado e pode falhar por falta de RAM se não houver Swap).
2. **2 Apontamentos DNS (Tipo A)** no seu gerenciador de domínio (Cloudflare, Registro.br, etc.):
   * `app.seudominio.com` ➔ IP da sua VPS (Frontend do CRM)
   * `api.seudominio.com` ➔ IP da sua VPS (Backend / API)
   * *Se usar Cloudflare:* Certifique-se de que a nuvem está cinza (DNS Only) inicialmente para a emissão do certificado SSL Let's Encrypt pelo Coolify, ou com WebSockets ativado.

---

## 🛠️ 2. Como Funciona a Instalação (Método Docker Compose)

Para tornar o processo o mais fácil possível, o projeto já vem configurado com:
* **`docker-compose.yml`** na raiz: sobe PostgreSQL 15, Redis 7, Backend e Frontend juntos em uma rede interna segura.
* **Auto-Setup no primeiro boot**: O backend executa automaticamente as migrações de banco e os dados iniciais (*seeds*), criando o usuário administrador e a empresa padrão.
* **Volume Persistente Automático**: Mídias, fotos, comprovantes e logos salvos em `/app/public` não se perdem em novos deploys.

---

## 🚀 3. Passo a Passo no Coolify (5 Minutos)

### Passo 1: Subir as alterações no seu GitHub / Git
Certifique-se de enviar os novos arquivos criados para o seu repositório:
```bash
git add .
git commit -m "feat: configuracoes completas para deploy no coolify"
git push
```

---

### Passo 2: Criar o Recurso no Coolify
1. Acesse o painel do seu **Coolify**.
2. Vá em **Projects** > Escolha seu projeto (ou crie um) > Escolha o ambiente (**production**).
3. Clique em **+ New Resource**.
4. Selecione **Git Repository**.
5. Escolha sua conta Git e selecione o repositório **VBSOLUTIONCRM**.
6. Selecione a branch principal (ex: `main` ou `master`).
7. Em **Build Pack**, selecione **Docker Compose**.
8. O Coolify detectará automaticamente o arquivo `docker-compose.yml` na raiz.

---

### Passo 3: Configurar as Variáveis de Ambiente
Na página da Stack recém-criada, acesse a aba **Environment Variables** e cole o seguinte bloco (substituindo com seus domínios e senhas seguras):

```env
BACKEND_URL=https://api.seudominio.com
FRONTEND_URL=https://app.seudominio.com
POSTGRES_DB=vbsolution
POSTGRES_USER=vbsolution
POSTGRES_PASSWORD=sua_senha_secreta_postgres_123
JWT_SECRET=gere_uma_chave_longa_aleatoria_aqui_32_chars
JWT_REFRESH_SECRET=gere_outra_chave_longa_aleatoria_aqui_32_chars
```

> 💡 *Dica:* Para gerar chaves JWT seguras, você pode rodar no terminal do seu computador:
> `openssl rand -hex 32`

---

### Passo 4: Configurar os Domínios dos Serviços
Dentro da sua stack no Coolify, você verá os 4 serviços listados: `frontend`, `backend`, `postgres`, `redis`.

1. Clique no serviço **frontend**:
   * No campo **Domains (FQDN)**, digite: `https://app.seudominio.com`
   * Salve as alterações.
2. Clique no serviço **backend**:
   * No campo **Domains (FQDN)**, digite: `https://api.seudominio.com`
   * Salve as alterações.
3. *Não precisa colocar domínio no Postgres ou Redis*, pois eles se comunicam com o backend de forma privada e segura pela rede interna do Docker.

---

### Passo 5: Fazer o Deploy!
1. Volte para a página principal da stack.
2. Clique no botão **Deploy** (no canto superior direito).
3. Acompanhe os logs de build:
   * O Coolify irá baixar o Postgres e o Redis.
   * Compilará a imagem do backend e aplicará as migrações/seeds.
   * Compilará a SPA do frontend e configurará o Nginx.
   * O Traefik emitirá automaticamente o certificado SSL (HTTPS) para ambos os domínios.

---

## 🔑 4. Primeiro Acesso

Assim que o deploy for concluído:

1. Acesse: `https://app.seudominio.com`
2. Faça login com as credenciais padrão criadas automaticamente:
   * **E-mail:** `admin@local.dev`
   * **Senha:** `123456`
3. ⚠️ **IMPORTANTE:** Vá imediatamente em **Configurações / Usuários** e altere o e-mail e a senha do administrador.

---

## 💡 Dicas de Ouro & Resolução de Problemas

### Como criar Swap na VPS (se o build do React travar por falta de RAM)
Se a VPS travar durante o `npm run build` do frontend, rode no terminal SSH da sua VPS:
```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### Por que o Redis é crucial?
As sessões de conexão do WhatsApp (Baileys) e a fila de disparos de mensagens em massa (Bull) gravam o estado no Redis. Caso o Redis fosse omitido, os QR Codes desconectariam após cada reinício. O `docker-compose.yml` já cuida disso mantendo o volume `redis_data` persistido.

### Como conectar o WhatsApp?
1. No menu lateral do CRM, vá em **Conexões**.
2. Clique em **Adicionar WhatsApp**.
3. Dê um nome para a conexão e clique em **Salvar**.
4. Clique no ícone de QR Code e escaneie com seu WhatsApp no celular.
