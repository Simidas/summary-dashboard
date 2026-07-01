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
  { value: 'diary', label: '日记', hint: '记录当天状态和碎碎念' },
  { value: 'review', label: '复盘', hint: '提炼成果、问题和下一步' },
  { value: 'idea', label: '灵感', hint: '判断可验证方向' },
  { value: 'content_seed', label: '内容素材', hint: '进入内容素材池' }
];

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
  return RECORD_TYPE_OPTIONS.find(item => item.value === type)?.label || legacy[type] || type || '记录';
}

export function getRecordTypeHint(type) {
  return RECORD_TYPE_OPTIONS.find(item => item.value === type)?.hint || '';
}
