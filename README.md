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
開發階段以本機 `npm run dev` 為主；生產 compose（`docker-compose.arm64.yml`）於 M25 建立。

```bash
# 以 repo 根目錄為 build context
docker build -f backend/Dockerfile --target runtime -t casino-backend .
```
