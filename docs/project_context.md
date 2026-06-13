# Virtual Casino Sandbox — Project Context

> 快速入門文件：給新加入的開發者或 AI 助手，用於理解專案狀態、架構與下一步。
> 詳細設計見 `docs/04_API_SPEC.md`、`docs/PROJECT_STATE.md` 及 `docs/` 設計文件資料夾。

---

## 專案簡介

**Virtual Casino Sandbox**（VCS）是一個運行於 Raspberry Pi 4（arm64）的全端線上賭場沙盒系統。
採用 Roguelite 機率設計：老虎機（92% RTP）、歐式輪盤、即時聊天、成就系統、排行榜、管理後台。
**技術棧**：Fastify 5 + Prisma + PostgreSQL + Redis + BullMQ（後端）、Vue 3 + Vite + Pinia + Socket.IO（前端）、npm workspaces monorepo。

---

## 目錄結構

```
casino/
├── backend/          # Fastify 5 API + Socket.IO + BullMQ 佇列
│   ├── src/
│   │   ├── modules/  # 各功能模組（auth, wallet, slot, roulette, admin…）
│   │   ├── plugins/  # Fastify 插件（prisma, redis, auth, rate-limit, hmac-guard）
│   │   ├── security/ # 密碼學工具（csprng, totp, aes）
│   │   ├── sockets/  # Socket.IO 事件定義與 Gateway
│   │   └── jobs/     # BullMQ 排程任務（jackpot-flush, leaderboard-refresh, daily-reset）
│   ├── prisma/       # Prisma schema + migrations + seed
│   └── test/         # Vitest 單元 & 整合測試（339 筆，全綠）
├── frontend/         # Vue 3 玩家端（老虎機、輪盤、聊天、排行榜、成就、個人頁）
├── admin-frontend/   # Vue 3 管理後台（M23 開發中）
├── packages/shared/  # DTO / enum / 常數（前端專用；後端自行鏡像）
├── docs/             # 設計文件（API spec, PROJECT_STATE, project_context…）
└── scripts/          # 維運工具（gen-secrets.sh, audit-balance.ts）
```

---

## Milestone 進度（截至 2026-06-13）

| Milestone | 內容 | 狀態 |
|-----------|------|------|
| M01–M10 | Infra、DB schema、Auth、Wallet、Slot 核心 | ✅ |
| M11–M13 | 前端骨架、老虎機前端、護符系統 | ✅ |
| M14 | Jackpot（Redis 累積 + BullMQ 10s flush + 派彩） | ✅ |
| M15 | Roulette 後端（Redis 狀態機、分散式 leader lock） | ✅ |
| M16 | Roulette 前端（WheelCanvas、BetBoard、ChipSelector） | ✅ |
| M17 | 聊天系統（Socket.IO + 7天清理排程） | ✅ |
| M18 | Daily 系統（登入連續獎勵 + 每日任務 + BullMQ 00:00 重設） | ✅ |
| M19 | 排行榜（物化視圖 daily/weekly/total + 快照） | ✅ |
| M20 | 成就系統 + 個人頁前端 | ✅ |
| M21 | 管理後台後端核心（TOTP 2FA、玩家管理、稽核、公告、Gift Code） | ✅ |
| M22 | Gift Code 兌換（玩家端）+ 紀錄查詢 API（admin）| ✅ |
| **M23** | **管理後台前端（待開發）** | 🚧 |
| M24–M28 | 監控告警、自動化部署、效能優化、Pi 4 部署 | ⬜ |

---

## 關鍵架構決策

### 安全
- **餘額鐵律**：全系統只有 `wallet` 模組可改 `users.balance`（ESLint `no-restricted-syntax` 強制）。
  每次改動伴隨一筆 `BalanceTransaction`，可全帳回放。
- **HMAC 封包簽章**（slot spin / roulette bet）：前端帶 `sig+nonce+seq+ts`，後端 `hmac-guard` 驗證。
- **Admin 2FA**：TOTP（otplib v13 + AES-256-GCM 加密 secret）+ reverifyToken 流（高危操作需
  `x-reverify-token` header）。

### 即時通訊
- Socket.IO 所有玩家連線時加入 `user:{userId}` 個人 room，供後端定向推播。
- Roulette 狀態機以 Redis `roulette:leader` NX lock 確保跨程序單一 leader。

### 排行榜
- 三張 PG 物化視圖（`leaderboard_daily/weekly/total`），BullMQ 每 5 分鐘 REFRESH CONCURRENTLY。
- 每日 00:00 Asia/Taipei 快照前 100 名至 `LeaderboardSnapshot`。

### Gift Code
- 玩家兌換：`POST /api/gift-codes/redeem`（JWT 認證）。
- 競態防護雙保險：`giftCode.updateMany` 條件更新 + `GiftCodeRedemption @@unique([giftCodeId, userId])`（P2002）。

---

## 開發指令速查

```bash
# 安裝依賴
npm install

# 啟動基礎設施（PostgreSQL + Redis）
docker compose up -d

# 初始化 DB
cd backend && npm run prisma:migrate && npm run prisma:seed

# 啟動開發（後端 :3000 + 前端 :5173）
npm run dev              # 在 monorepo 根目錄

# 測試（339 筆）
cd backend && npm test

# TypeScript 檢查 + Lint
cd backend && npm run typecheck && npm run lint
```

---

## 環境變數（必填）

複製 `.env.example` 為 `.env`：

```
DATABASE_URL=postgresql://casino:<PASSWORD>@localhost:5432/casino_dev
JWT_SECRET=<64-hex>        # bash scripts/gen-secrets.sh 自動產生
AES_256_GCM_KEY=<64-hex>  # TOTP secret 加密用
ADMIN_INITIAL_PASSWORD=<安全密碼>
```

---

## 下一步：M23 管理後台前端

- 消費 `POST /api/admin/totp/*` 完成 2FA 綁定/登入流程（reverifyToken header 模式）
- 玩家管理列表、詳情、封鎖/調幣（高危操作需先取得 reverifyToken）
- 公告 CRUD、Gift Code 建立（高危）、稽核日誌查詢、紀錄查詢（login/bets/tx）
- 參考：`backend/src/modules/admin/admin.routes.ts`（路由清單）、`admin.types.ts`（DTO）

---

*更新日期：2026-06-13　Milestone：M22*
