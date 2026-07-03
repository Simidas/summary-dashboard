import {
  createFollowupFromAnalysis,
  generateAnalysisSnapshot,
  getAnalysisSnapshot
} from '../api.js?v=20260703b';

export function buildAnalysisPanel({
  scopeType,
  scopeKey,
  windowDays = 0,
  windowOptions = [],
  analysis = null,
  title = 'AI 分析草稿',
  generateLabel = '生成分析',
  emptyText = '基于现有记录生成一版分析草稿。'
}) {
  const activeWindow = Number(analysis?.windowDays || windowDays || 0);
  const options = windowOptions.map(Number).filter(Boolean);

  return `
    <section class="ops-panel analysis-panel"
      data-analysis-panel
      data-scope-type="${escapeAttr(scopeType)}"
      data-scope-key="${escapeAttr(scopeKey)}"
      data-window-days="${escapeAttr(activeWindow)}"
      data-window-options="${escapeAttr(options.join(','))}"
      data-analysis-id="${escapeAttr(analysis?.id || '')}"
      data-title="${escapeAttr(title)}"
      data-generate-label="${escapeAttr(generateLabel)}"
      data-empty-text="${escapeAttr(emptyText)}">
      <div class="section-heading analysis-panel-heading">
        <div>
          <h2 class="section-title">${escapeHtml(title)}</h2>
          ${analysis?.updatedAt ? `<span class="panel-date">更新 ${escapeHtml(formatShortTime(analysis.updatedAt))}</span>` : ''}
        </div>
        <div class="analysis-actions">
          ${options.length ? `
            <div class="filter-tabs analysis-window-tabs">
              ${options.map(days => `
                <button class="filter-tab ${days === activeWindow ? 'active' : ''}" type="button" data-analysis-window-option="${escapeAttr(days)}">
                  近 ${escapeHtml(days)} 天
                </button>
              `).join('')}
            </div>
          ` : ''}
          <button class="filter-tab" type="button" data-analysis-generate>${escapeHtml(generateLabel)}</button>
        </div>
      </div>
      <div class="analysis-panel-body">
        ${renderAnalysisBody(analysis, emptyText)}
      </div>
      <div class="form-status" data-analysis-status></div>
    </section>
  `;
}

export function bindAnalysisPanel(root) {
  if (!root || root.dataset.analysisPanelBound === 'true') return;
  root.dataset.analysisPanelBound = 'true';

  root.addEventListener('click', async (event) => {
    const generateButton = event.target.closest('[data-analysis-generate]');
    if (generateButton) {
      await handleGenerateClick(root, generateButton);
      return;
    }

    const windowButton = event.target.closest('[data-analysis-window-option]');
    if (windowButton) {
      await handleWindowClick(root, windowButton);
      return;
    }

    const followupButton = event.target.closest('[data-analysis-followup-index]');
    if (followupButton) {
      await handleFollowupClick(followupButton);
    }
  });
}

async function handleGenerateClick(root, button) {
  const panel = button.closest('[data-analysis-panel]');
  if (!panel) return;

  const options = getPanelOptions(panel);
  const status = panel.querySelector('[data-analysis-status]');
  button.disabled = true;
  status.textContent = 'AI 分析生成中...';

  try {
    const data = await generateAnalysisSnapshot(options.scopeType, options.scopeKey, {
      windowDays: options.windowDays || undefined
    });
    replacePanel(panel, data.analysis);
  } catch (error) {
    status.textContent = error.message || '生成失败';
  } finally {
    button.disabled = false;
  }
}

async function handleWindowClick(root, button) {
  const panel = button.closest('[data-analysis-panel]');
  if (!panel) return;

  const nextWindowDays = Number(button.dataset.analysisWindowOption || 0);
  const options = getPanelOptions(panel);
  const status = panel.querySelector('[data-analysis-status]');
  panel.dataset.windowDays = String(nextWindowDays);
  status.textContent = '读取中...';

  try {
    const data = await getAnalysisSnapshot(options.scopeType, options.scopeKey, {
      windowDays: nextWindowDays
    });
    replacePanel(panel, data.analysis, nextWindowDays);
  } catch (error) {
    status.textContent = error.message || '读取失败';
  }
}

async function handleFollowupClick(button) {
  const panel = button.closest('[data-analysis-panel]');
  const analysisId = panel?.dataset.analysisId;
  const status = panel?.querySelector('[data-analysis-status]');
  if (!analysisId || !panel || !status) return;

  button.disabled = true;
  status.textContent = '正在转为待办...';

  try {
    const data = await createFollowupFromAnalysis(analysisId, {
      actionIndex: Number(button.dataset.analysisFollowupIndex)
    });
    button.textContent = data.created ? '已转待办' : '已存在';
    status.textContent = data.created ? '已新增到未闭环事项' : '这条待办已经存在';
    panel.dispatchEvent(new CustomEvent('analysis-followup-created', {
      bubbles: true,
      detail: data
    }));
  } catch (error) {
    status.textContent = error.message || '转待办失败';
    button.disabled = false;
  }
}

function replacePanel(panel, analysis, explicitWindowDays = null) {
  const options = getPanelOptions(panel);
  const nextWindowDays = explicitWindowDays ?? analysis?.windowDays ?? options.windowDays;
  panel.outerHTML = buildAnalysisPanel({
    ...options,
    windowDays: nextWindowDays,
    analysis
  });
}

function renderAnalysisBody(analysis, emptyText) {
  if (!analysis) {
    return `<div class="empty-inline">${escapeHtml(emptyText)}</div>`;
  }

  const insights = analysis.insights || {};
  const nextActions = normalizeActions(analysis.nextActions);

  return `
    <div class="analysis-summary">
      ${insights.headline ? `<strong>${escapeHtml(insights.headline)}</strong>` : ''}
      ${insights.summary ? `<p>${escapeHtml(insights.summary)}</p>` : ''}
      ${insights.affirmation ? `<p class="analysis-affirmation">${escapeHtml(insights.affirmation)}</p>` : ''}
      ${analysis.status === 'failed' ? `<span class="status-chip status-chip-warning">${escapeHtml(analysis.errorMessage || 'AI 生成失败，已保留事实草稿')}</span>` : ''}
    </div>
    <div class="insight-grid analysis-insight-grid">
      ${renderInsightColumn('事实', insights.facts)}
      ${renderInsightColumn('状态', insights.state)}
      ${renderInsightColumn('推进', insights.progress)}
      ${renderInsightColumn('卡点', insights.blockers)}
    </div>
    ${insights.patterns?.length ? renderTagGroup('模式', insights.patterns) : ''}
    ${insights.watchItems?.length ? renderTagGroup('观察', insights.watchItems) : ''}
    ${nextActions.length ? `
      <div class="analysis-next-actions">
        <h3>下一步</h3>
        ${nextActions.map((action, index) => `
          <article class="analysis-action-row">
            <div>
              <strong>${escapeHtml(action.text)}</strong>
              ${action.reason ? `<span>${escapeHtml(action.reason)}</span>` : ''}
            </div>
            <button class="filter-tab" type="button" data-analysis-followup-index="${escapeAttr(index)}">转待办</button>
          </article>
        `).join('')}
      </div>
    ` : ''}
  `;
}

function renderInsightColumn(title, items = []) {
  if (!items?.length) {
    return `
      <div class="insight-column">
        <h3>${escapeHtml(title)}</h3>
        <p class="empty-inline">暂无明确数据。</p>
      </div>
    `;
  }

  return `
    <div class="insight-column">
      <h3>${escapeHtml(title)}</h3>
      <ul>
        ${items.slice(0, 5).map(item => `<li>${escapeHtml(item)}</li>`).join('')}
      </ul>
    </div>
  `;
}

function renderTagGroup(label, items = []) {
  return `
    <div class="analysis-tag-group">
      <span>${escapeHtml(label)}</span>
      <div class="pill-list">
        ${items.slice(0, 6).map(item => `<span class="tag">${escapeHtml(item)}</span>`).join('')}
      </div>
    </div>
  `;
}

function normalizeActions(actions = []) {
  return actions.map(item => {
    if (typeof item === 'string') return { text: item, reason: '' };
    return {
      text: item?.text || item?.title || item?.action || '',
      reason: item?.reason || item?.size || ''
    };
  }).filter(item => item.text);
}

function getPanelOptions(panel) {
  return {
    scopeType: panel.dataset.scopeType,
    scopeKey: panel.dataset.scopeKey,
    windowDays: Number(panel.dataset.windowDays || 0),
    windowOptions: String(panel.dataset.windowOptions || '')
      .split(',')
      .map(Number)
      .filter(Boolean),
    title: panel.dataset.title || 'AI 分析草稿',
    generateLabel: panel.dataset.generateLabel || '生成分析',
    emptyText: panel.dataset.emptyText || '基于现有记录生成一版分析草稿。'
  };
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
