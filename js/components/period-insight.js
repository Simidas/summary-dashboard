export function createPeriodInsightPanel(insight, titleFallback = '周期经营洞察') {
  const normalized = normalizeInsight(insight);
  const section = document.createElement('section');
  section.className = 'period-insight-panel animate-fade-in-up';
  section.innerHTML = `
    <div class="section-heading">
      <h2 class="section-title">${escapeHtml(normalized.title || titleFallback)}</h2>
      <span class="panel-date">${escapeHtml(normalized.dateRange || normalized.periodKey || '')}</span>
    </div>
    <p class="period-insight-lead">${escapeHtml(normalized.headline || '这一周期的数据还在积累中。')}</p>
    ${buildMetricGrid(normalized.metrics || [])}
    <div class="period-insight-grid">
      ${buildInsightColumn('关键成果', normalized.wins || [], '还没有明确成果。')}
      ${buildInsightColumn('趋势和状态', [...(normalized.trendHighlights || []), ...(normalized.stateHighlights || [])], '趋势还不明显。')}
      ${buildInsightColumn('反复卡点', normalized.blockers || [], '还没有显式卡点。')}
      ${buildInsightColumn('下一步重点', normalized.nextFocus || [], '先继续记录，再收束下一步。')}
    </div>
  `;
  return section;
}

function normalizeInsight(insight = {}) {
  return {
    ...insight,
    title: insight.title || insight.theme,
    headline: insight.headline || insight.summary,
    nextFocus: insight.nextFocus || insight.nextWeekFocus
  };
}

function buildMetricGrid(metrics) {
  if (!metrics.length) return '';

  return `
    <div class="period-metric-grid">
      ${metrics.map(metric => `
        <article class="period-metric-card is-${escapeAttr(metric.tone || 'neutral')}">
          <span>${escapeHtml(metric.label)}</span>
          <strong>${escapeHtml(metric.value)}</strong>
          <small>${escapeHtml(metric.detail || '')}</small>
        </article>
      `).join('')}
    </div>
  `;
}

function buildInsightColumn(title, items = [], emptyText = '暂无记录') {
  const list = items.length ? items : [emptyText];
  return `
    <div class="period-insight-column">
      <h3>${escapeHtml(title)}</h3>
      <ul class="plain-list">
        ${list.slice(0, 6).map(item => `<li>${escapeHtml(item)}</li>`).join('')}
      </ul>
    </div>
  `;
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value == null ? '' : String(value);
  return div.innerHTML;
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, '&quot;');
}
