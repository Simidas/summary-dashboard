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
      topTags: topValues(domainRecords.flatMap(record => record.tags || []), 6),
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
  return Array.from(groups.entries())
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([key, group]) => {
      const { year, week } = parseWeekKey(key);
      const groupDates = distinct(group.activities.map(item => item.date)).sort();
      const weekFollowups = followups.filter(item => getWeekKey(item.createdAt || item.sourceDate || item.dueDate) === key);
      const weekContent = contentItems.filter(item => getWeekKey(item.createdAt) === key);
      const topProjects = topValues(group.records.flatMap(record => record.projects || []), 5);
      const topTags = topValues(group.records.flatMap(record => record.tags || []), 6);

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
        dailyRecords: groupDates
      };
    });
}

export function buildWeeklyInsight(summary, records = [], dailyReviews = [], followups = []) {
  if (!summary) return null;
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
  return Array.from(groups.entries())
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

      return {
        key,
        year: Number(year),
        month,
        monthName: MONTH_NAMES[Number(month) - 1] || key,
        totalAchievements: countAchievements(group.records, group.reviews),
        totalDiscussions: group.records.length,
        weeks: distinct(group.activities.map(item => getWeekKey(item.date))).map(value => value.split('-')[1]),
        topProjects: topValues(group.records.flatMap(record => record.projects || []), 5),
        topTags: topValues(group.records.flatMap(record => record.tags || []), 6),
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
        modeSummary: `${MONTH_NAMES[Number(month) - 1] || key}共沉淀 ${group.records.length} 条记录，覆盖 ${domainDistribution.filter(item => item.count > 0).length} 个场景。`
      };
    });
}

export function buildYearlySummaries({ records = [], dailyReviews = [], projects = [], contentItems = [] } = {}) {
  const groups = groupActivitiesBy(records, dailyReviews, date => safeDate(date).slice(0, 4));
  return Array.from(groups.entries())
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([year, group]) => ({
      year: Number(year),
      totalAchievements: countAchievements(group.records, group.reviews),
      totalProjects: projects.filter(project => !project.deletedAt).length || topValues(group.records.flatMap(record => record.projects || [])).length,
      totalContentPublished: contentItems.filter(item => item.status === 'published' && safeDate(item.createdAt).startsWith(year)).length,
      contentSeeds: contentItems.filter(item => safeDate(item.createdAt).startsWith(year)).length,
      topTags: topValues(group.records.flatMap(record => record.tags || []), 8),
      months: distinct(group.activities.map(item => safeDate(item.date).slice(0, 7))).filter(Boolean).sort()
    }));
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

function safeDate(value) {
  if (!value) return '';
  const text = String(value);
  const match = text.match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : '';
}
