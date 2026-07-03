import { getRecord } from '../api.js?v=20260703a';

const DEFAULT_ATTEMPTS = 24;
const DEFAULT_INTERVAL_MS = 2500;

export async function waitForRecordAiSuggestion(recordId, options = {}) {
  if (!recordId) return null;

  const attempts = Number(options.attempts || DEFAULT_ATTEMPTS);
  const intervalMs = Number(options.intervalMs || DEFAULT_INTERVAL_MS);

  for (let index = 0; index < attempts; index += 1) {
    await delay(intervalMs);

    try {
      const data = await getRecord(recordId);
      const record = data?.record;
      if (record?.aiSuggestion) {
        options.onReady?.(record.aiSuggestion, record);
        return record;
      }
    } catch (error) {
      if (index >= attempts - 1) {
        options.onError?.(error);
      }
    }
  }

  options.onTimeout?.();
  return null;
}

export function buildAiPendingCard(text = '记录已保存，AI 建议生成中。') {
  return `
    <article class="ai-result-card ai-result-card-pending">
      <div class="domain-card-topline">
        <span>AI 生成中</span>
        <span>后台处理</span>
      </div>
      <p>${escapeHtml(text)}</p>
    </article>
  `;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value == null ? '' : String(value);
  return div.innerHTML;
}
