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

export const DAILY_MOOD_OPTIONS = [
  { value: '平静', label: '平静' },
  { value: '开心', label: '开心' },
  { value: '有进展感', label: '有进展感' },
  { value: '疲惫', label: '疲惫' },
  { value: '焦虑', label: '焦虑' },
  { value: '烦躁', label: '烦躁' },
  { value: '低落', label: '低落' },
  { value: '松了一口气', label: '松了一口气' }
];

export const TOPIC_TAG_OPTIONS_BY_TYPE = {
  emotion: ['压力', '焦虑', '低落', '烦躁', '开心', '关系', '自我要求', '需要支持'],
  task: ['推进', '排查', '优化', '沟通', '验证', '决策', '交付', '复盘'],
  note: ['方法', '观察', '业务理解', '技术沉淀', '产品观察', '认知', '案例', '资料'],
  review: ['成果', '问题', '经验', '卡点', '改进', '决策', '关系', '节奏'],
  idea: ['产品定位', '增长', '商业化', '自动化', '内容选题', '用户需求', '实验', '机会'],
  diary: ['家庭', '亲子沟通', '夫妻关系', '日常', '感悟', '情绪出口', '个人成长', '陪伴'],
  health: ['睡眠', '饮食', '运动', '精力', '身体不适', '体重', '恢复', '作息']
};

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
  return RECORD_TYPE_OPTIONS.find(item => item.value === type)?.label
    || type
    || '记录';
}

export function getRecordTypeHint(type) {
  return RECORD_TYPE_OPTIONS.find(item => item.value === type)?.hint || '';
}

export function getTopicTagOptions(type) {
  return TOPIC_TAG_OPTIONS_BY_TYPE[type] || [];
}
