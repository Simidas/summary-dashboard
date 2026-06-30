import { generatePeriodReview, getPeriodReview, updatePeriodReview } from '../api.js?v=20260630f';
import { getAuthState, isApiEnabled } from '../auth.js?v=20260630f';

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

  bindPeriodReviewCards(root);
}

function fillPeriodReviewForm(form, review = {}) {
  form.elements.theme.value = review.theme || '';
  form.elements.summary.value = review.summary || '';
  form.elements.wins.value = joinLines(review.wins);
  form.elements.blockers.value = joinLines(review.blockers);
  form.elements.nextActions.value = joinLines(review.nextActions);
  form.elements.status.value = review.status || 'draft';
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

function bindPeriodReviewCards(root) {
  if (root.dataset.periodReviewCardsBound === 'true') return;
  root.dataset.periodReviewCardsBound = 'true';
  const currentForm = root.querySelector('[data-period-review-form]');
  if (currentForm) setActivePeriodReviewCard(root, currentForm.dataset.periodType, currentForm.dataset.periodKey);

  root.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-period-review-edit]');
    if (!button || !root.contains(button)) return;

    const card = button.closest('[data-period-review-card]');
    const type = button.dataset.periodType || card?.dataset.periodType;
    const label = button.dataset.periodLabel || getPeriodLabel(type);
    const periodKey = button.dataset.periodReviewEdit || card?.dataset.periodKey;
    const editor = root.querySelector('[data-period-review-panel]');
    const form = editor?.querySelector('[data-period-review-form]');
    const status = editor?.querySelector('[data-period-review-status]');
    if (!type || !periodKey || !editor || !form) return;

    button.disabled = true;
    const oldText = button.textContent;
    button.textContent = '加载中...';

    try {
      const data = await getPeriodReview(type, periodKey);
      setPeriodReviewEditor(editor, form, type, periodKey, label, data.review);
      setActivePeriodReviewCard(root, type, periodKey);
      if (status) status.textContent = '已加载周期复盘';
      editor.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      if (status) status.textContent = error.message || '加载失败';
    } finally {
      button.disabled = false;
      button.textContent = oldText;
    }
  });

  root.addEventListener('period-review:changed', (event) => {
    updatePeriodReviewCard(root, event.detail?.review);
  });
}

function updateEditorDate(panel, periodKey, review) {
  const date = panel?.querySelector('.panel-date');
  if (!date) return;
  date.textContent = `${periodKey}${review?.updatedAt ? ` · ${formatShortTime(review.updatedAt)}` : ''}`;
}

function updatePeriodReviewCard(root, review) {
  if (!review) return;
  const card = findPeriodReviewCard(root, review.periodType, review.periodKey);
  if (!card) return;

  card.classList.add('has-review');
  const status = card.querySelector('[data-period-review-card-status]');
  if (status) {
    status.textContent = review.status === 'confirmed' ? '已确认' : '草稿';
    status.className = `period-review-digest-status ${review.status}`;
  }
  const theme = card.querySelector('[data-period-review-card-theme]');
  if (theme) theme.textContent = review.theme || '未命名复盘';
  const summary = card.querySelector('[data-period-review-card-summary]');
  if (summary) summary.textContent = review.summary || '还没有填写总结。';
  const updated = card.querySelector('[data-period-review-card-updated]');
  if (updated) updated.textContent = review.updatedAt ? formatShortTime(review.updatedAt) : '';
  setActivePeriodReviewCard(root, review.periodType, review.periodKey);
}

function setActivePeriodReviewCard(root, type, periodKey) {
  root.querySelectorAll('[data-period-review-card]').forEach(card => {
    const active = card.dataset.periodType === type && card.dataset.periodKey === periodKey;
    card.classList.toggle('active', active);
    card.closest('.aggregation-card, .year-hero-card')?.classList.toggle('period-review-card-active', active);
  });
}

function findPeriodReviewCard(root, type, periodKey) {
  return root.querySelector(`[data-period-review-card][data-period-type="${cssEscape(type)}"][data-period-key="${cssEscape(periodKey)}"]`);
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

function getPeriodLabel(type) {
  if (type === 'weekly') return '周';
  if (type === 'monthly') return '月';
  if (type === 'yearly') return '年';
  return '周期';
}
