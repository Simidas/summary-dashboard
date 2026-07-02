/* ========================================
   Record Type Metadata
   ======================================== */

export const DOMAIN_OPTIONS = [
  { value: 'work', label: '主业' },
  { value: 'side_business', label: '副业' },
  { value: 'content', label: '内容' },
  { value: 'life', label: '生活' }
];

export const RECORD_TYPE_OPTIONS = [
  { value: 'emotion', label: '情绪', hint: '接住情绪，给一点支持' },
  { value: 'task', label: '任务', hint: '生成未闭环事项' },
  { value: 'note', label: '笔记', hint: '沉淀要点和标签' },
  { value: 'review', label: '复盘', hint: '提炼成果、问题和下一步' },
  { value: 'idea', label: '灵感', hint: '判断可验证方向' },
  { value: 'diary', label: '日记', hint: '记录生活流、当天片段和碎碎念', domains: ['life'] },
  { value: 'health', label: '健康', hint: '记录睡眠、饮食、运动、身体状态和精力', domains: ['life'] }
];

export const LEGACY_RECORD_TYPE_OPTIONS = [
  { value: 'content_seed', label: '内容素材', hint: '历史内容素材记录' },
  { value: 'progress', label: '进展', hint: '历史进展记录' },
  { value: 'thought', label: '想法', hint: '历史想法记录' },
  { value: 'blocker', label: '卡点', hint: '历史卡点记录' },
  { value: 'reflection', label: '反思', hint: '历史反思记录' }
];

export function getAvailableRecordTypes(domain) {
  return RECORD_TYPE_OPTIONS.filter(item => !item.domains || item.domains.includes(domain));
}

export function normalizeRecordTypeForDomain(type, domain) {
  const available = getAvailableRecordTypes(domain);
  if (available.some(item => item.value === type)) return type;
  return available[0]?.value || 'note';
}

export function getDomainLabel(domain) {
  return DOMAIN_OPTIONS.find(item => item.value === domain)?.label || domain || '未分类';
}

export function getRecordTypeLabel(type) {
  const legacy = {
    progress: '进展',
    thought: '想法',
    blocker: '卡点',
    reflection: '反思'
  };
  return RECORD_TYPE_OPTIONS.find(item => item.value === type)?.label
    || LEGACY_RECORD_TYPE_OPTIONS.find(item => item.value === type)?.label
    || legacy[type]
    || type
    || '记录';
}

export function getRecordTypeHint(type) {
  return RECORD_TYPE_OPTIONS.find(item => item.value === type)?.hint
    || LEGACY_RECORD_TYPE_OPTIONS.find(item => item.value === type)?.hint
    || '';
}
