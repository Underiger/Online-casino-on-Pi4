# Virtual Casino Sandbox

虛擬賭場沙盒（純娛樂、無真錢交易）。Monorepo 採 **npm workspaces**，技術棧：

| 層 | 技術 |
|---|---|
| 後端 | Node.js 20 + TypeScript 5 (strict) + Fastify 4 + Socket.IO 4 + Prisma 5 + BullMQ 5 |
| 前端 | Vue 3 + Vite 5 + Pinia + Vue Router（玩家端 `frontend/`、管理後台 `admin-frontend/`）|
| 共用 | `packages/shared` — 前後端共用 DTO / Socket 事件 / Enum（單一真值來源）|
| 資料 | PostgreSQL 16（dev 亦可用 SQLite）+ Redis 7 |

完整設計文件見 `docs/`（GDD / TDD / DATABASE_DESIGN / FOLDER_STRUCTURE / MILESTONES）。
**開發前必讀 `docs/PROJECT_STATE.md`** 了解目前進度。

---

## 目錄結構（頂層）

```
├── backend/            # Fastify API + Socket.IO + BullMQ
├── frontend/           # 玩家端 Vue 3 SPA（dev: http://localhost:5173）
├── admin-frontend/     # 管理後台 Vue 3 SPA（dev: http://localhost:5174/admin/）
├── packages/shared/    # 前後端共用 TS 型別
├── scripts/            # 金鑰產生、部署、備份等腳本
├── docs/               # 設計文件 + PROJECT_STATE.md
├── docker-compose.yml  # 開發用 PostgreSQL + Redis
└── .env.example        # 環境變數範本
```

---

## 快速啟動（開發環境）

### 0. 先決條件

- Node.js **20 LTS** 以上、npm 10 以上
- Docker 與 Docker Compose（啟動 PostgreSQL / Redis 用）
- （Windows 使用者）建議透過 Git Bash 或 WSL 執行 `scripts/*.sh`

### 1. 安裝依賴

```bash
npm install
```

npm workspaces 會一次安裝 root、backend、frontend、admin-frontend、packages/shared 的全部依賴。

### 2. 建立環境變數

```bash
cp .env.example .env
bash scripts/gen-secrets.sh   # 產生 JWT_SECRET / AES_256_GCM_KEY / Admin 初始密碼並寫入 .env
```

也可手動編輯 `.env`，把所有 `change_me` 換成自己的值。

### 3. 啟動資料庫服務（PostgreSQL 16 + Redis 7）

```bash
docker compose up -d
docker compose ps        # 確認兩個服務皆 healthy
```

資料以 named volume（`pgdata` / `redisdata`）持久化，`docker compose down` 不會清除資料；
要完全重置請用 `docker compose down -v`。

### 4. 資料庫 Migration（M02 之後可用）

```bash
npm run -w backend prisma:migrate   # = prisma migrate dev
npm run -w backend prisma:seed      # 種子資料：jackpot、護符池、任務池、Admin 帳號
```

> M01 階段尚未建立 Prisma schema，此步驟在 Milestone M02 完成後生效。

### 5. 啟動開發伺服器

```bash
npm run dev              # 同時啟動 backend + frontend + admin-frontend
```

或分開啟動：

```bash
npm run dev:backend      # http://localhost:3000   （GET / → { "ok": true }）
npm run dev:frontend     # http://localhost:5173   （顯示 "Frontend works"）
npm run dev:admin        # http://localhost:5174/admin/
```

驗證後端：

```bash
curl http://localhost:3000/
# {"ok":true}
```

### 6. 其他常用命令

```bash
npm run build            # 建置全部 workspace
npm run lint             # ESLint（後端含 Math.random 禁用規則）+ 前端型別檢查
npm run typecheck        # 全部 workspace 型別檢查
npm run format           # Prettier 全專案格式化
```

---

## 開發約定（重點）

- **嚴禁 `Math.random`**：全專案唯一亂數出口為 `backend/src/security/csprng.ts`（M06 建立），
  ESLint `no-restricted-properties` 會直接報 error。
- **餘額只能經 wallet 模組**：禁止在其他模組直接 `prisma.user.update` 改餘額，ESLint 已設規則攔截。
- 每完成一個 Milestone：更新 `docs/PROJECT_STATE.md` → 附建議 Commit Message → 停下等待確認。

## Docker（後端映像）

`backend/Dockerfile` 為多階段建置（node:20-alpine，arm64 相容，目標部署平台 Raspberry Pi 4）。
開發階段以本機 `npm run dev` 為主；生產部署使用 `docker-compose.arm64.yml`（見下方「生產部署」章節）。

```bash
# 以 repo 根目錄為 build context
docker build -f backend/Dockerfile --target runtime -t casino-backend .
```

---

## 生產部署（Raspberry Pi 4 / arm64）

### 架構概覽

```
Internet ─── Nginx (80/443) ─── Node.js App (3000, cluster ×2)
                                  ├── PostgreSQL (internal)
                                  └── Redis (internal)
```

所有服務在 Docker 橋接網路內互通；只有 Nginx 對外暴露 80/443。

### 先決條件（Pi 4 上）

- Docker Engine 24+ 與 Docker Compose v2
- Node.js 20 LTS（用於建置前端 dist；若已有 CI/CD 可省略）
- 已設定 SSH 金鑰登入（建議停用密碼登入）

### 部署步驟

#### 1. 建立生產環境設定

```bash
cp .env.example .env.production
nano .env.production
# 必須修改：
#   NODE_ENV=production
#   POSTGRES_PASSWORD=（強密碼）
#   POSTGRES_DB=casino_prod
#   DATABASE_URL=postgresql://casino:PASSWORD@postgres:5432/casino_prod?schema=public
#   REDIS_URL=redis://redis:6379
# 然後執行：
bash scripts/gen-secrets.sh    # 自動填入 JWT_SECRET / AES_256_GCM_KEY / ADMIN_INITIAL_PASSWORD
```

#### 2. 產生 TLS 憑證

```bash
# 自簽憑證（測試用，瀏覽器會警告）：
bash scripts/gen-cert.sh

# 正式域名請改用 Let's Encrypt：
# sudo apt install certbot
# sudo certbot certonly --standalone -d yourdomain.com
# 然後更新 nginx/conf.d/site.conf 中的 ssl_certificate 路徑
```

#### 3. 執行部署

```bash
bash scripts/deploy.sh
```

`deploy.sh` 自動完成以下步驟：
1. 環境檢查（.env.production / TLS 憑證）
2. `git pull --ff-only`
3. `npm install --prefer-offline`
4. 建置前端 dist（frontend + admin-frontend）
5. 建置 Docker 映像（backend/Dockerfile target:runtime）
6. 執行 Prisma migration（使用 `--profile migrate` 服務）
7. `docker compose up -d` 啟動全部服務

#### 4. 核心強化（選用，需 root）

```bash
# Linux 核心參數強化（SYN Cookie / rp_filter / kptr_restrict 等）
sudo bash scripts/sysctl-hardening.sh

# 若使用 Cloudflare 代理：僅允許 CF IP 段訪問 80/443
sudo bash scripts/cf-allowlist.sh
```

### 備份與還原

```bash
# 手動備份（保留最近 7 天）
bash scripts/backup.sh

# 建議加入 crontab（每日 03:00）：
# 0 3 * * * /bin/bash /home/pi/casino/scripts/backup.sh >> /var/log/casino-backup.log 2>&1

# 互動式還原
bash scripts/restore.sh

# 還原指定備份
bash scripts/restore.sh backups/backup_20260614_030000.sql.gz
```

### 服務管理

```bash
# 查看狀態
docker compose -f docker-compose.arm64.yml --env-file .env.production ps

# 查看日誌
docker compose -f docker-compose.arm64.yml --env-file .env.production logs -f app
docker compose -f docker-compose.arm64.yml --env-file .env.production logs -f nginx

# 重啟單一服務
docker compose -f docker-compose.arm64.yml --env-file .env.production restart app

# 更新部署（拉取最新代碼後）
bash scripts/deploy.sh
```

### 資源限制（Pi 4 4 GB RAM）

| 服務 | 記憶體上限 | 說明 |
|------|-----------|------|
| PostgreSQL | 768 MB | 主資料庫 |
| Node.js App | 512 MB | cluster ×2 workers，共用 |
| Redis | 256 MB | maxmemory 200 MB + LRU |
| Nginx | 64 MB | TLS 終止 + 靜態檔案 |
