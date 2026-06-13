/**
 * 異常下注偵測骨架（02_TDD §5.7）— M06 先落地頻率視窗，完整規則於 M24 補齊。
 *
 * 偵測規則（Redis 滑動視窗統計）：
 *   1. 下注頻率 > 2 次/秒                       → BET_RATE        ✅ M06
 *   2. 勝率連續 3 個視窗 > 99%                  → WIN_RATE        🚧 M24（需 BetRecord 流量）
 *   3. 單日淨贏 > 全服 P99 × 10                 → NET_WIN_OUTLIER 🚧 M24（需每日結算統計）
 *
 * 命中後僅「標記」（onFlag 回呼，由 M24 接 User.flagged + Admin 通知），
 * 不自動封鎖——人工裁決（02_TDD §5.7）。
 */
import type { Redis } from 'ioredis';

export type AnomalyReason = 'BET_RATE' | 'WIN_RATE' | 'NET_WIN_OUTLIER';

/** 頻率規則：每 1 秒視窗超過 2 次下注即標記 */
export const BET_RATE_WINDOW_SECONDS = 1;
export const BET_RATE_MAX_PER_WINDOW = 2;

export interface AnomalyDetectorOptions {
  /**
   * 命中異常時的回呼（fire-and-forget；M24 在此寫 User.flagged 並通知 Admin）。
   * 預設僅輸出警告日誌。
   */
  onFlag?: (userId: string, reason: AnomalyReason) => void;
  log?: { warn: (obj: unknown, msg?: string) => void };
}

export function createAnomalyDetector(redis: Redis, options: AnomalyDetectorOptions = {}) {
  const onFlag =
    options.onFlag ??
    ((userId: string, reason: AnomalyReason): void => {
      options.log?.warn({ userId, reason }, 'anomaly detected (flag callback 未接，僅記錄)');
    });

  return {
    /**
     * 每筆下注呼叫一次（spin / roulette bet 結算路徑外的非阻塞統計）。
     * 回傳本次命中的異常原因（空陣列 = 正常）。
     * Redis 失敗時靜默略過——偵測屬輔助功能，永不阻斷下注主流程。
     */
    async recordBet(userId: string, _amount: bigint, _payout: bigint): Promise<AnomalyReason[]> {
      const reasons: AnomalyReason[] = [];
      try {
        // ── 規則 1：下注頻率（固定 1 秒桶；超過閾值即標記） ──
        const bucket = Math.floor(Date.now() / (BET_RATE_WINDOW_SECONDS * 1_000));
        const freqKey = `anomaly:freq:${userId}:${bucket}`;
        const count = await redis.incr(freqKey);
        if (count === 1) {
          await redis.expire(freqKey, BET_RATE_WINDOW_SECONDS * 2);
        }
        if (count > BET_RATE_MAX_PER_WINDOW) {
          reasons.push('BET_RATE');
        }

        // ── 規則 2（M24）：勝率連續 3 視窗 > 99% ──
        // TODO(M24): 以 5 分鐘視窗統計 win/total，連續 3 視窗超標 → WIN_RATE

        // ── 規則 3（M24）：單日淨贏 > 全服 P99 × 10 ──
        // TODO(M24): daily-reset job 計算全服 P99，INCRBY anomaly:netwin:{userId}:{dateKey}
      } catch (err) {
        options.log?.warn({ err: (err as Error).message }, 'anomaly: redis 不可用，本次略過統計');
        return [];
      }

      for (const reason of reasons) {
        onFlag(userId, reason);
      }
      return reasons;
    },
  };
}

export type AnomalyDetector = ReturnType<typeof createAnomalyDetector>;
