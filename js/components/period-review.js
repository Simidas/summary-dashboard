import { getPeriodReview, updatePeriodReview } from '../api.js?v=20260626n';
import { getAuthState, isApiEnabled } from '../auth.js?v=20260626n';

export async function buildPeriodReviewPanel(type, periodKey, label) {
  const authState = getAuthState();
  if (!periodKey || !authState.apiAvailable || authState.user?.role !== 'owner' || !isApiEnabled()) return '';

  const data = await getPeriodReview(type, periodKey).catch(() => null);
  const review = data?.review || null;

  return `
    <section class="settings-panel period-review-panel" data-period-review-panel>
      <div class="section-heading">
        <h2 class="section-title">${escapeHtml(label)}复盘草稿</h2>
        <span class="panel-date">${escapeHtml(periodKey)}${review?.updatedAt ? ` · ${escapeHtml(formatShortTime(review.updatedAt))}` : ''}</span>
      </div>
      ${review ? buildReviewPreview(review) : '<div class="empty-inline">这一周期还没有在线复盘草稿。</div>'}
      <form class="dashboard-settings-form" data-period-review-form data-period-type="${escapeAttr(type)}" data-period-key="${escapeAttr(periodKey)}">
        <label>
          <span>主题</span>
          <input name="theme" value="${escapeAttr(review?.theme || '')}" placeholder="这一周期最核心的主题">
        </label>
        <label>
          <span>总结</span>
          <textarea name="summary" rows="4" placeholder="用几句话讲清楚发生了什么、你怎么看、下一步是什么">${escapeHtml(review?.summary || '')}</textarea>
        </label>
        <div class="record-form-grid">
          <label>
            <span>胜利</span>
            <textarea name="wins" rows="4" placeholder="一行一条">${escapeHtml(joinLines(review?.wins))}</textarea>
          </label>
          <label>
            <span>卡点</span>
            <textarea name="blockers" rows="4" placeholder="一行一条">${escapeHtml(joinLines(review?.blockers))}</textarea>
          </label>
        </div>
        <label>
          <span>下一步</span>
          <textarea name="nextActions" rows="3" placeholder="一行一条，越小越好">${escapeHtml(joinLines(review?.nextActions))}</textarea>
        </label>
        <div class="record-form-footer">
          <label class="inline-select">
            <span>状态</span>
            <select name="status">
              <option value="draft" ${review?.status !== 'confirmed' ? 'selected' : ''}>草稿</option>
              <option value="confirmed" ${review?.status === 'confirmed' ? 'selected' : ''}>已确认</option>
            </select>
          </label>
          <span class="form-status" data-period-review-status></span>
          <button class="primary-action" type="submit">保存周期复盘</button>
        </div>
      </form>
    </section>
  `;
}

export function bindPeriodReviewForms(root) {
  root.querySelectorAll('[data-period-review-form]').forEach(form => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = form.querySelector('button[type="submit"]');
      const status = form.querySelector('[data-period-review-status]');
      button.disabled = true;
      status.textContent = '保存中...';

      try {
        const data = await updatePeriodReview(form.dataset.periodType, form.dataset.periodKey, {
          theme: form.elements.theme.value,
          summary: form.elements.summary.value,
          wins: splitLines(form.elements.wins.value),
          blockers: splitLines(form.elements.blockers.value),
          nextActions: splitLines(form.elements.nextActions.value),
          status: form.elements.status.value
        });
        status.textContent = data.review?.status === 'confirmed' ? '已确认' : '草稿已保存';
      } catch (error) {
        status.textContent = error.message || '保存失败';
      } finally {
        button.disabled = false;
      }
    });
  });
}

function buildReviewPreview(review) {
  return `
    <article class="period-review-preview">
      <div class="domain-card-topline">
        <span>${escapeHtml(review.status === 'confirmed' ? '已确认' : '草稿')}</span>
        <span>${escapeHtml(review.updatedAt ? formatShortTime(review.updatedAt) : '')}</span>
      </div>
      ${review.theme ? `<h3>${escapeHtml(review.theme)}</h3>` : ''}
      ${review.summary ? `<p>${escapeHtml(review.summary)}</p>` : ''}
      <div class="insight-grid">
        ${buildColumn('胜利', review.wins)}
        ${buildColumn('卡点', review.blockers)}
        ${buildColumn('下一步', review.nextActions)}
      </div>
    </article>
  `;
}

function buildColumn(title, items = []) {
  if (!items.length) return '';
  return `
    <div class="insight-column">
      <h3>${escapeHtml(title)}</h3>
      <ul class="plain-list">
        ${items.slice(0, 5).map(item => `<li>${escapeHtml(item)}</li>`).join('')}
      </ul>
    </div>
  `;
}

function splitLines(value) {
  return String(value || '')
    .split('\n')
    .map(item => item.trim())
    .filter(Boolean);
}

function joinLines(items = []) {
  return Array.isArray(items) ? items.join('\n') : '';
}

function formatShortTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value == null ? '' : String(value);
  return div.innerHTML;
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, '&quot;');
}
