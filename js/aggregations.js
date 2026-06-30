export const DOMAIN_META = [
  {
    id: 'work',
    label: '主业',
    description: '公寓租赁行业系统后端开发、业务理解和技术沉淀。'
  },
  {
    id: 'side_business',
    label: '副业',
    description: '网站产品出海、产品实验、增长验证和商业化。'
  },
  {
    id: 'life',
    label: '生活和自我',
    description: '经营家庭关系、夫妻、父子、儿女关系，以及自己的身心状态。'
  },
  {
    id: 'content',
    label: '内容产出',
    description: '从工作、副业和生活里沉淀可公开表达的公众号内容素材。'
  }
];

const DOMAIN_LABELS = Object.fromEntries(DOMAIN_META.map(item => [item.id, item.label]));
const MONTH_NAMES = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];

export function getDomainMeta(domainId) {
  return DOMAIN_META.find(item => item.id === domainId) || {
    id: domainId,
    label: domainId || '未分类',
    description: '这个场景还没有描述。'
  };
}

export function getDomainLabel(domainId) {
  return DOMAIN_LABELS[domainId] || domainId || '未分类';
}

export function buildDomainSummaries({ records = [], followups = [], contentItems = [], settingsByDomain = {} } = {}) {
  return DOMAIN_META.map(meta => {
    const domainRecords = records.filter(record => record.domain === meta.id);
    const domainFollowups = followups.filter(item => item.domain === meta.id);
    const openFollowUps = domainFollowups.filter(item => item.status === 'open' || item.status === 'deferred');
    const domainContent = contentItems.filter(item => item.sourceDomain === meta.id);
    const latestRecord = domainRecords[0];
    const settings = settingsByDomain[meta.id] || {};
    const blockers = domainRecords
      .filter(record => record.type === 'blocker')
      .map(record => record.summary || record.content)
      .filter(Boolean);

    return {
      ...meta,
      recordCount: domainRecords.length,
      progressCount: domainRecords.filter(record => record.type === 'progress').length,
      discussionCount: domainRecords.filter(record => record.type === 'thought' || record.type === 'reflection').length,
      followupCount: domainFollowups.length,
      contentSeedCount: domainContent.length,
      currentFocus: settings.currentFocus || latestRecord?.summary || latestRecord?.content || '',
      nextAction: settings.nextAction || latestRecord?.aiSuggestion?.nextSmallStep || latestRecord?.nextActions?.[0] || openFollowUps[0]?.text || '',
      openFollowUps,
      overdueFollowUps: openFollowUps.filter(item => item.overdue),
      blockers: topValues(blockers, 6),
      topProjects: topValues(domainRecords.flatMap(record => record.projects || []), 5),
      topTags: topValues(domainRecords.flatMap(getRecordContentTags), 6),
      contentSeeds: domainContent.map(item => ({
        ...item,
        sourceDomainLabel: meta.label,
        sourceDate: item.createdAt ? item.createdAt.slice(0, 10) : ''
      })),
      recentRecords: domainRecords.slice(0, 12).map(record => ({
        date: record.date || record.createdAt?.slice(0, 10) || '',
        type: record.type,
        domain: record.domain,
        domainLabel: meta.label,
        text: record.summary || record.content || '',
        projects: record.projects || [],
        nextActions: record.nextActions || []
      })),
      latestRecordDate: latestRecord?.date || null
    };
  });
}

export function buildWeeklySummaries({ records = [], dailyReviews = [], followups = [], contentItems = [] } = {}) {
  const groups = groupActivitiesBy(records, dailyReviews, date => getWeekKey(date));
  const summaries = Array.from(groups.entries())
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([key, group]) => {
      const { year, week } = parseWeekKey(key);
      const groupDates = distinct(group.activities.map(item => item.date)).sort();
      const weekFollowups = followups.filter(item => getWeekKey(item.createdAt || item.sourceDate || item.dueDate) === key);
      const weekContent = contentItems.filter(item => getWeekKey(item.createdAt) === key);
      const topProjects = topValues(group.records.flatMap(getRecordProjects), 5);
      const topTags = topValues(group.records.flatMap(getRecordContentTags), 6);
      const activity = buildPeriodActivity(group, weekFollowups, weekContent, {
        expectedReviewDays: 7,
        contentLabel: '篇内容发布'
      });

      return {
        key,
        year,
        week,
        dateRange: getWeekDateRange(key),
        days: groupDates.length,
        totalAchievements: countAchievements(group.records, group.reviews),
        totalDiscussions: group.records.length,
        totalFollowUps: weekFollowups.length,
        topProjects,
        topTags,
        contentPublished: weekContent.filter(item => item.status === 'published').length,
        contentSeeds: weekContent.length,
        dailyRecords: groupDates,
        ...activity
      };
    });

  return attachPeriodInsights(summaries, 'weekly');
}

export function buildWeeklyInsight(summary, records = [], dailyReviews = [], followups = []) {
  if (!summary) return null;
  if (summary.insight) return summary.insight;

  const weekRecords = records.filter(record => getWeekKey(record.date || record.createdAt) === summary.key);
  const weekReviews = dailyReviews.filter(review => getWeekKey(review.date) === summary.key);
  const wins = [
    ...weekReviews.flatMap(review => review.wins || []),
    ...weekRecords.filter(record => record.type === 'progress').map(record => record.summary || record.content)
  ].filter(Boolean);
  const blockers = [
    ...weekReviews.flatMap(review => review.blockers || []),
    ...weekRecords.filter(record => record.type === 'blocker').map(record => record.summary || record.content)
  ].filter(Boolean);
  const openFollowUps = followups
    .filter(item => (item.status === 'open' || item.status === 'deferred') && getWeekKey(item.createdAt || item.dueDate) === summary.key)
    .map(item => item.text)
    .filter(Boolean);

  return {
    week: summary.key,
    dateRange: summary.dateRange,
    theme: summary.topProjects[0] ? `聚焦 ${summary.topProjects[0]}` : '本周洞察',
    summary: `本周记录 ${summary.days} 天，沉淀 ${summary.totalDiscussions} 条记录。`,
    wins: topValues(wins, 5),
    blockers: blockers.length ? topValues(blockers, 5) : ['本周没有显式记录阻塞'],
    nextWeekFocus: openFollowUps.slice(0, 5)
  };
}

export function buildMonthlySummaries({ records = [], dailyReviews = [], followups = [], contentItems = [] } = {}) {
  const groups = groupActivitiesBy(records, dailyReviews, date => safeDate(date).slice(0, 7));
  const summaries = Array.from(groups.entries())
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([key, group]) => {
      const [year, month] = key.split('-');
      const monthFollowups = followups.filter(item => safeDate(item.createdAt || item.sourceDate || item.dueDate).startsWith(key));
      const monthContent = contentItems.filter(item => safeDate(item.createdAt).startsWith(key));
      const domainDistribution = DOMAIN_META.map(meta => ({
        domain: meta.id,
        label: meta.label,
        count: group.records.filter(record => record.domain === meta.id).length
      }));
      const activity = buildPeriodActivity(group, monthFollowups, monthContent, {
        expectedReviewDays: getMonthDays(Number(year), Number(month)),
        contentLabel: '篇内容发布'
      });

      return {
        key,
        year: Number(year),
        month,
        monthName: MONTH_NAMES[Number(month) - 1] || key,
        totalAchievements: countAchievements(group.records, group.reviews),
        totalDiscussions: group.records.length,
        weeks: distinct(group.activities.map(item => getWeekKey(item.date))).map(value => value.split('-')[1]),
        topProjects: topValues(group.records.flatMap(getRecordProjects), 5),
        topTags: topValues(group.records.flatMap(getRecordContentTags), 6),
        contentPublished: monthContent.filter(item => item.status === 'published').length,
        contentSeeds: monthContent.length,
        domainDistribution,
        repeatedBlockers: topValues([
          ...group.reviews.flatMap(review => review.blockers || []),
          ...group.records.filter(record => record.type === 'blocker').map(record => record.summary || record.content)
        ].filter(Boolean), 5),
        openFollowUps: monthFollowups.filter(item => item.status === 'open' || item.status === 'deferred'),
        nextMonthStrategy: monthFollowups
          .filter(item => item.status === 'open' || item.status === 'deferred')
          .map(item => item.text)
          .slice(0, 5),
        modeSummary: `${MONTH_NAMES[Number(month) - 1] || key}共沉淀 ${group.records.length} 条记录，覆盖 ${domainDistribution.filter(item => item.count > 0).length} 个场景。`,
        ...activity
      };
    });

  return attachPeriodInsights(summaries, 'monthly');
}

export function buildYearlySummaries({ records = [], dailyReviews = [], followups = [], projects = [], contentItems = [] } = {}) {
  const groups = groupActivitiesBy(records, dailyReviews, date => safeDate(date).slice(0, 4));
  const summaries = Array.from(groups.entries())
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([year, group]) => {
      const yearFollowups = followups.filter(item => safeDate(item.createdAt || item.sourceDate || item.dueDate).startsWith(year));
      const yearContent = contentItems.filter(item => safeDate(item.createdAt).startsWith(year));
      const yearProjects = projects.filter(project => !project.deletedAt);
      const projectNames = topValues(group.records.flatMap(getRecordProjects), 8);
      const activity = buildPeriodActivity(group, yearFollowups, yearContent, {
        expectedReviewDays: getYearExpectedDays(Number(year)),
        contentLabel: '篇内容发布'
      });

      return {
        year: Number(year),
        totalAchievements: countAchievements(group.records, group.reviews),
        totalProjects: yearProjects.length || projectNames.length,
        totalContentPublished: yearContent.filter(item => item.status === 'published').length,
        contentPublished: yearContent.filter(item => item.status === 'published').length,
        contentSeeds: yearContent.length,
        topProjects: distinct([
          ...yearProjects.map(project => project.name).filter(Boolean),
          ...projectNames
        ]).slice(0, 8),
        topTags: topValues(group.records.flatMap(getRecordContentTags), 8),
        months: distinct(group.activities.map(item => safeDate(item.date).slice(0, 7))).filter(Boolean).sort(),
        ...activity
      };
    });

  return attachPeriodInsights(summaries, 'yearly');
}

function buildPeriodActivity(group, periodFollowups = [], periodContent = [], options = {}) {
  const reviewDates = distinct(group.reviews.map(review => safeDate(review.date || review.createdAt))).sort();
  const recordDates = distinct(group.records.map(record => safeDate(record.date || record.createdAt))).sort();
  const activityDates = distinct([
    ...reviewDates,
    ...recordDates
  ]).sort();
  const wins = collectWins(group.records, group.reviews);
  const blockers = collectBlockers(group.records, group.reviews);
  const nextActions = collectNextActions(group.records, group.reviews, periodFollowups);
  const openFollowups = periodFollowups.filter(item => item.status === 'open' || item.status === 'deferred');
  const completedFollowups = periodFollowups.filter(item => item.status === 'closed').length;
  const overdueFollowups = openFollowups.filter(item => item.overdue).length;
  const totalFollowups = periodFollowups.length;
  const avgEnergy = averageEnergy(group.reviews, group.records);
  const moodTags = topValues([
    ...group.reviews.map(review => review.mood),
    ...group.records.map(record => record.mood)
  ], 3);
  const expectedReviewDays = Number(options.expectedReviewDays || activityDates.length || 1);
  const reviewRate = expectedReviewDays ? Math.round((reviewDates.length / expectedReviewDays) * 100) : 0;
  const closureRate = totalFollowups ? Math.round((completedFollowups / totalFollowups) * 100) : 0;
  const domainDistribution = DOMAIN_META.map(meta => ({
    domain: meta.id,
    label: meta.label,
    count: group.records.filter(record => record.domain === meta.id).length
  }));
  const dominantDomain = [...domainDistribution].sort((a, b) => b.count - a.count)[0];

  return {
    reviewDays: reviewDates.length,
    recordDays: recordDates.length,
    activityDays: activityDates.length,
    reviewRate,
    wins: topValues(wins, 6),
    blockers: topValues(blockers, 6),
    nextActions: nextActions.slice(0, 6),
    completedFollowups,
    totalFollowUps: totalFollowups,
    openFollowups,
    openFollowUps: openFollowups,
    overdueFollowups,
    closureRate,
    averageEnergy: avgEnergy,
    moodTags,
    domainDistribution,
    dominantDomain: dominantDomain?.count ? dominantDomain : null,
    contentPublished: periodContent.filter(item => item.status === 'published').length,
    contentSeeds: periodContent.length,
    contentLabel: options.contentLabel || '内容发布'
  };
}

function attachPeriodInsights(summaries, periodType) {
  return summaries.map((summary, index) => {
    const previous = summaries[index + 1] || null;
    const trend = buildPeriodTrend(summary, previous);
    const enriched = { ...summary, trend };
    return {
      ...enriched,
      insight: buildPeriodInsight(enriched, periodType)
    };
  });
}

function buildPeriodTrend(current, previous) {
  return {
    reviewDaysDelta: delta(current.reviewDays, previous?.reviewDays),
    achievementsDelta: delta(current.totalAchievements, previous?.totalAchievements),
    completedFollowupsDelta: delta(current.completedFollowups, previous?.completedFollowups),
    overdueFollowupsDelta: delta(current.overdueFollowups, previous?.overdueFollowups),
    energyDelta: current.averageEnergy != null && previous?.averageEnergy != null
      ? Number((current.averageEnergy - previous.averageEnergy).toFixed(1))
      : null,
    closureRateDelta: current.closureRate != null && previous?.closureRate != null
      ? current.closureRate - previous.closureRate
      : null
  };
}

function buildPeriodInsight(summary, periodType) {
  const label = getPeriodInsightLabel(summary, periodType);
  const energyText = summary.averageEnergy == null ? '暂无能量数据' : `能量均值 ${summary.averageEnergy}/5`;
  const closureText = summary.totalFollowUps
    ? `闭环 ${summary.completedFollowups}/${summary.totalFollowUps}`
    : '暂无新增待办';
  const headline = `${label}复盘 ${summary.reviewDays} 天，沉淀 ${summary.totalAchievements || 0} 个成果，${closureText}。${energyText}。`;

  return {
    title: `${label}经营洞察`,
    periodKey: summary.key || String(summary.year || ''),
    dateRange: summary.dateRange || summary.key || String(summary.year || ''),
    headline,
    metrics: buildInsightMetrics(summary, periodType),
    wins: summary.wins || [],
    blockers: summary.blockers || [],
    nextFocus: summary.nextActions || [],
    trendHighlights: buildTrendHighlights(summary, periodType),
    stateHighlights: buildStateHighlights(summary),
    domainDistribution: summary.domainDistribution || []
  };
}

function buildInsightMetrics(summary, periodType) {
  const reviewValue = periodType === 'weekly'
    ? `${summary.reviewDays || 0}/7`
    : `${summary.reviewDays || 0} 天`;

  return [
    {
      label: '复盘节奏',
      value: reviewValue,
      detail: formatDelta(summary.trend?.reviewDaysDelta, '天'),
      tone: trendTone(summary.trend?.reviewDaysDelta)
    },
    {
      label: '事项闭环',
      value: summary.totalFollowUps ? `${summary.closureRate || 0}%` : '--',
      detail: summary.totalFollowUps ? `${summary.completedFollowups || 0}/${summary.totalFollowUps}` : '暂无待办',
      tone: trendTone(summary.trend?.closureRateDelta)
    },
    {
      label: '成果沉淀',
      value: String(summary.totalAchievements || 0),
      detail: formatDelta(summary.trend?.achievementsDelta, '个'),
      tone: trendTone(summary.trend?.achievementsDelta)
    },
    {
      label: '能量均值',
      value: summary.averageEnergy == null ? '--' : String(summary.averageEnergy),
      detail: formatDelta(summary.trend?.energyDelta, ''),
      tone: trendTone(summary.trend?.energyDelta)
    },
    {
      label: '超时事项',
      value: String(summary.overdueFollowups || 0),
      detail: `${summary.openFollowups?.length || 0} 个未闭环`,
      tone: trendTone(summary.trend?.overdueFollowupsDelta, true)
    }
  ];
}

function buildTrendHighlights(summary, periodType) {
  const highlights = [
    describeTrend('复盘节奏', summary.trend?.reviewDaysDelta, '天'),
    describeTrend('成果沉淀', summary.trend?.achievementsDelta, '个'),
    describeTrend('闭环事项', summary.trend?.completedFollowupsDelta, '个'),
    describeTrend('能量', summary.trend?.energyDelta, '')
  ].filter(Boolean);

  if (summary.overdueFollowups) {
    highlights.push(`还有 ${summary.overdueFollowups} 个超时事项，需要尽快清掉。`);
  }

  if (!highlights.length) {
    highlights.push(periodType === 'yearly' ? '这一年已经形成可回看的经营轨迹。' : '这一周期的数据还少，先保持记录节奏。');
  }

  return highlights;
}

function buildStateHighlights(summary) {
  return [
    summary.dominantDomain ? `投入最多：${summary.dominantDomain.label} ${summary.dominantDomain.count} 条` : '',
    summary.moodTags?.length ? `高频状态：${summary.moodTags.join('、')}` : '',
    summary.blockers?.length ? `主要卡点：${summary.blockers.slice(0, 2).join('；')}` : '',
    summary.contentSeeds ? `内容素材 ${summary.contentSeeds} 条，已发布 ${summary.contentPublished || 0} 条` : ''
  ].filter(Boolean);
}

function getPeriodInsightLabel(summary, periodType) {
  if (periodType === 'weekly') return '本周';
  if (periodType === 'monthly') return summary.monthName || '本月';
  if (periodType === 'yearly') return `${summary.year || ''} 年`;
  return '本周期';
}

function collectWins(records, reviews) {
  return [
    ...reviews.flatMap(review => review.wins || []),
    ...records.filter(record => record.type === 'progress').map(record => record.summary || record.content)
  ].filter(Boolean);
}

function collectBlockers(records, reviews) {
  return [
    ...reviews.flatMap(review => review.blockers || []),
    ...records.filter(record => record.type === 'blocker').map(record => record.summary || record.content)
  ].filter(Boolean);
}

function collectNextActions(records, reviews, followups) {
  return distinct([
    ...reviews.map(review => review.tomorrowFirstStep),
    ...records.flatMap(record => record.nextActions || []),
    ...followups
      .filter(item => item.status === 'open' || item.status === 'deferred')
      .map(item => item.text)
  ]).filter(Boolean);
}

function averageEnergy(reviews, records) {
  const reviewValues = reviews.map(review => Number(review.energy)).filter(Number.isFinite);
  const recordValues = records.map(record => Number(record.energy)).filter(Number.isFinite);
  const values = reviewValues.length ? reviewValues : recordValues;
  if (!values.length) return null;
  const sum = values.reduce((total, value) => total + value, 0);
  return Number((sum / values.length).toFixed(1));
}

function delta(current = 0, previous = null) {
  if (previous == null) return null;
  return Number(current || 0) - Number(previous || 0);
}

function formatDelta(value, suffix) {
  if (value == null || value === 0) return '较上周期持平';
  const prefix = value > 0 ? '+' : '';
  return `较上周期 ${prefix}${value}${suffix}`;
}

function describeTrend(label, value, suffix) {
  if (value == null || value === 0) return '';
  const direction = value > 0 ? '增加' : '减少';
  return `${label}较上周期${direction} ${Math.abs(value)}${suffix}。`;
}

function trendTone(value, reverse = false) {
  if (value == null || value === 0) return 'neutral';
  const isPositive = reverse ? value < 0 : value > 0;
  return isPositive ? 'positive' : 'negative';
}

function groupActivitiesBy(records, dailyReviews, getKey) {
  const groups = new Map();
  records.forEach(record => {
    const date = safeDate(record.date || record.createdAt);
    if (!date) return;
    const key = getKey(date);
    if (!key) return;
    const group = ensureGroup(groups, key);
    group.records.push(record);
    group.activities.push({ date, type: 'record' });
  });

  dailyReviews.forEach(review => {
    const date = safeDate(review.date || review.createdAt);
    if (!date) return;
    const key = getKey(date);
    if (!key) return;
    const group = ensureGroup(groups, key);
    group.reviews.push(review);
    group.activities.push({ date, type: 'dailyReview' });
  });

  return groups;
}

function ensureGroup(groups, key) {
  if (!groups.has(key)) groups.set(key, { records: [], reviews: [], activities: [] });
  return groups.get(key);
}

function countAchievements(records, reviews) {
  return records.filter(record => record.type === 'progress').length
    + reviews.reduce((count, review) => count + (review.wins?.length || 0), 0);
}

function topValues(items, limit = 5) {
  const counts = new Map();
  items.filter(Boolean).forEach(item => {
    const key = String(item).trim();
    if (!key) return;
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'))
    .slice(0, limit)
    .map(([value]) => value);
}

function getRecordContentTags(record) {
  return distinct([
    ...(record.tags || []),
    ...(record.aiSuggestion?.suggestedTags || [])
  ]);
}

function getRecordProjects(record) {
  return record.projects || [];
}

function distinct(items) {
  return Array.from(new Set(items.filter(Boolean)));
}

function getWeekKey(value) {
  const dateStr = safeDate(value);
  if (!dateStr) return '';
  const date = new Date(`${dateStr}T00:00:00.000Z`);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function parseWeekKey(key) {
  const [year, week] = String(key || '').split('-');
  return { year: Number(year), week };
}

function getWeekDateRange(key) {
  const { year, week } = parseWeekKey(key);
  const weekNo = Number(String(week || '').replace('W', ''));
  if (!year || !weekNo) return '';
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - jan4Day + 1 + (weekNo - 1) * 7);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return `${monday.toISOString().slice(0, 10)} ~ ${sunday.toISOString().slice(0, 10)}`;
}

function getMonthDays(year, month) {
  if (!year || !month) return 30;
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function getYearExpectedDays(year) {
  if (!year) return 365;
  return ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0) ? 366 : 365;
}

function safeDate(value) {
  if (!value) return '';
  const text = String(value);
  const match = text.match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : '';
}
