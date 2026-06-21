/**
 * Telegram 2FA 短輪詢任務 processor 單元測試。
 *
 * 驗證業務意圖：poll 任務分派至 admin.pollTelegramUpdates；未知任務僅警告不誤動作；
 * pollTelegramUpdates 拋錯時 processor 吞錯（不讓例外外溢中斷 Worker，下次迭代重試）。
 */
import { describe, expect, it, vi } from 'vitest';
import {
  createTelegramPollProcessor,
  TELEGRAM_POLL_JOB,
} from '../../src/jobs/telegram-2fa-poll.job.js';

describe('telegram-2fa-job: poll processor', () => {
  it('poll → 呼叫 pollTelegramUpdates', async () => {
    const pollTelegramUpdates = vi.fn(async () => undefined);
    const processor = createTelegramPollProcessor({ pollTelegramUpdates });

    await processor({ name: TELEGRAM_POLL_JOB });

    expect(pollTelegramUpdates).toHaveBeenCalledTimes(1);
  });

  it('未知任務名稱 → 僅警告，不呼叫 pollTelegramUpdates', async () => {
    const pollTelegramUpdates = vi.fn(async () => undefined);
    const warn = vi.fn();
    const processor = createTelegramPollProcessor({ pollTelegramUpdates, log: { warn } });

    await processor({ name: 'unknown' });

    expect(pollTelegramUpdates).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });

  it('pollTelegramUpdates 拋錯 → processor 吞錯記日誌，不外溢', async () => {
    const pollTelegramUpdates = vi.fn(async () => {
      throw new Error('boom');
    });
    const warn = vi.fn();
    const processor = createTelegramPollProcessor({ pollTelegramUpdates, log: { warn } });

    await expect(processor({ name: TELEGRAM_POLL_JOB })).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });
});
