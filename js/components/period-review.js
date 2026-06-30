import { generatePeriodReview, getPeriodReview, getPeriodReviews, updatePeriodReview } from '../api.js?v=20260630e';
import { getAuthState, isApiEnabled } from '../auth.js?v=20260630e';

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
      <div data-period-review-preview-slot>
        ${review ? buildReviewPreview(review) : '<div class="empty-inline">这一周期还没有在线复盘草稿。</div>'}
      </div>
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
          <button class="filter-tab" type="button" data-period-review-generate>AI 生成草稿</button>
          <button class="primary-action" type="submit">保存周期复盘</button>
        </div>
      </form>
    </section>
  `;
}

export async function buildPeriodReviewHistoryPanel(type, label, currentKey) {
  const authState = getAuthState();
  if (!authState.apiAvailable || authState.user?.role !== 'owner' || !isApiEnabled()) return '';

  const data = await getPeriodReviews({ type, limit: 50 }).catch(() => null);
  const reviews = data?.reviews || [];

  return `
    <section class="settings-panel period-review-history-panel" data-period-review-history data-period-type="${escapeAttr(type)}" data-period-label="${escapeAttr(label)}">
      <div class="section-heading">
        <h2 class="section-title">周期复盘历史</h2>
        <span class="panel-date">${escapeHtml(label)}复盘 · ${reviews.length} 条</span>
      </div>
      ${reviews.length ? `
        <div class="period-review-history-list">
          ${reviews.map(review => buildHistoryItem(review, currentKey)).join('')}
        </div>
      ` : '<div class="empty-inline">还没有保存过周期复盘。</div>'}
    </section>
  `;
}

export function bindPeriodReviewForms(root) {
  root.querySelectorAll('[data-period-review-form]').forEach(form => {
    if (form.dataset.periodReviewBound === 'true') return;
    form.dataset.periodReviewBound = 'true';

    const panel = form.closest('[data-period-review-panel]');
    const status = form.querySelector('[data-period-review-status]');
    const previewSlot = panel?.querySelector('[data-period-review-preview-slot]');
    const generateButton = form.querySelector('[data-period-review-generate]');

    generateButton?.addEventListener('click', async () => {
      generateButton.disabled = true;
      status.textContent = 'AI 生成中...';

      try {
        const data = await generatePeriodReview(form.dataset.periodType, form.dataset.periodKey);
        fillPeriodReviewForm(form, data.review);
        if (previewSlot) previewSlot.innerHTML = buildReviewPreview(data.review);
        updateEditorDate(panel, form.dataset.periodKey, data.review);
        emitReviewChanged(panel, data.review);
        status.textContent = data.ai?.status === 'failed'
          ? '已用现有数据生成草稿，AI 返回异常'
          : 'AI 草稿已生成';
      } catch (error) {
        status.textContent = error.message || '生成失败';
      } finally {
        generateButton.disabled = false;
      }
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = form.querySelector('button[type="submit"]');
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
        if (previewSlot && data.review) previewSlot.innerHTML = buildReviewPreview(data.review);
        updateEditorDate(panel, form.dataset.periodKey, data.review);
        emitReviewChanged(panel, data.review);
        status.textContent = data.review?.status === 'confirmed' ? '已确认' : '草稿已保存';
      } catch (error) {
        status.textContent = error.message || '保存失败';
      } finally {
        button.disabled = false;
      }
    });
  });

  bindPeriodReviewHistory(root);
}

function fillPeriodReviewForm(form, review = {}) {
  form.elements.theme.value = review.theme || '';
  form.elements.summary.value = review.summary || '';
  form.elements.wins.value = joinLines(review.wins);
  form.elements.blockers.value = joinLines(review.blockers);
  form.elements.nextActions.value = joinLines(review.nextActions);
  form.elements.status.value = review.status || 'draft';
}

function bindPeriodReviewHistory(root) {
  root.querySelectorAll('[data-period-review-history]').forEach(panel => {
    if (panel.dataset.periodReviewHistoryBound === 'true') return;
    panel.dataset.periodReviewHistoryBound = 'true';

    panel.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-period-review-edit]');
      if (!button) return;

      const type = panel.dataset.periodType;
      const label = panel.dataset.periodLabel;
      const periodKey = button.dataset.periodReviewEdit;
      const editor = root.querySelector('[data-period-review-panel]');
      const form = editor?.querySelector('[data-period-review-form]');
      const status = editor?.querySelector('[data-period-review-status]');
      if (!editor || !form) return;

      button.disabled = true;
      const oldText = button.textContent;
      button.textContent = '加载中...';

      try {
        const data = await getPeriodReview(type, periodKey);
        setPeriodReviewEditor(editor, form, type, periodKey, label, data.review);
        setActiveHistoryItem(panel, periodKey);
        if (status) status.textContent = '已加载历史复盘';
        editor.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (error) {
        if (status) status.textContent = error.message || '加载失败';
      } finally {
        button.disabled = false;
        button.textContent = oldText;
      }
    });

    root.addEventListener('period-review:changed', (event) => {
      updateHistoryItem(panel, event.detail?.review);
    });
  });
}

function setPeriodReviewEditor(panel, form, type, periodKey, label, review) {
  form.dataset.periodType = type;
  form.dataset.periodKey = periodKey;
  fillPeriodReviewForm(form, review || {});

  const title = panel.querySelector('.section-title');
  if (title) title.textContent = `${label}复盘草稿`;

  const date = panel.querySelector('.panel-date');
  if (date) {
    date.textContent = `${periodKey}${review?.updatedAt ? ` · ${formatShortTime(review.updatedAt)}` : ''}`;
  }

  const previewSlot = panel.querySelector('[data-period-review-preview-slot]');
  if (previewSlot) {
    previewSlot.innerHTML = review
      ? buildReviewPreview(review)
      : '<div class="empty-inline">这一周期还没有在线复盘草稿。</div>';
  }
}

function updateEditorDate(panel, periodKey, review) {
  const date = panel?.querySelector('.panel-date');
  if (!date) return;
  date.textContent = `${periodKey}${review?.updatedAt ? ` · ${formatShortTime(review.updatedAt)}` : ''}`;
}

function buildHistoryItem(review, currentKey) {
  const isActive = review.periodKey === currentKey;
  return `
    <article class="period-review-history-item ${isActive ? 'active' : ''}" data-period-review-history-item="${escapeAttr(review.periodKey)}">
      <div class="domain-card-topline">
        <span>${escapeHtml(review.periodKey)}</span>
        <span data-history-status>${escapeHtml(review.status === 'confirmed' ? '已确认' : '草稿')}</span>
      </div>
      <h3 data-history-theme>${escapeHtml(review.theme || '未命名复盘')}</h3>
      <p data-history-summary>${escapeHtml(review.summary || '还没有填写总结。')}</p>
      <div class="period-review-history-footer">
        <span data-history-updated>${escapeHtml(review.updatedAt ? formatShortTime(review.updatedAt) : '')}</span>
        <button class="filter-tab" type="button" data-period-review-edit="${escapeAttr(review.periodKey)}">查看/编辑</button>
      </div>
    </article>
  `;
}

function updateHistoryItem(panel, review) {
  if (!review || review.periodType !== panel.dataset.periodType) return;

  const list = panel.querySelector('.period-review-history-list');
  if (!list) {
    panel.querySelector('.empty-inline')?.remove();
    const container = document.createElement('div');
    container.className = 'period-review-history-list';
    container.innerHTML = buildHistoryItem(review, review.periodKey);
    panel.appendChild(container);
    updateHistoryCount(panel);
    return;
  }

  const existing = list.querySelector(`[data-period-review-history-item="${cssEscape(review.periodKey)}"]`);
  if (!existing) {
    list.insertAdjacentHTML('afterbegin', buildHistoryItem(review, review.periodKey));
    setActiveHistoryItem(panel, review.periodKey);
    updateHistoryCount(panel);
    return;
  }

  existing.querySelector('[data-history-status]').textContent = review.status === 'confirmed' ? '已确认' : '草稿';
  existing.querySelector('[data-history-theme]').textContent = review.theme || '未命名复盘';
  existing.querySelector('[data-history-summary]').textContent = review.summary || '还没有填写总结。';
  existing.querySelector('[data-history-updated]').textContent = review.updatedAt ? formatShortTime(review.updatedAt) : '';
  setActiveHistoryItem(panel, review.periodKey);
}

function setActiveHistoryItem(panel, periodKey) {
  panel.querySelectorAll('[data-period-review-history-item]').forEach(item => {
    item.classList.toggle('active', item.dataset.periodReviewHistoryItem === periodKey);
  });
}

function updateHistoryCount(panel) {
  const count = panel.querySelectorAll('[data-period-review-history-item]').length;
  const date = panel.querySelector('.panel-date');
  if (date) date.textContent = `${panel.dataset.periodLabel}复盘 · ${count} 条`;
}

function emitReviewChanged(panel, review) {
  if (!panel || !review) return;
  panel.dispatchEvent(new CustomEvent('period-review:changed', {
    bubbles: true,
    detail: { review }
  }));
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

function cssEscape(value) {
  if (window.CSS?.escape) return window.CSS.escape(value);
  return String(value).replace(/["\\]/g, '\\$&');
}
