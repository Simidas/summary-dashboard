import { buildCompanionPrompt } from '../prompts/companion.js';
import { buildPeriodReviewPrompt } from '../prompts/period-review.js';
import { buildAnalysisPrompt } from '../prompts/analysis.js';
import { validateAiSuggestionResult } from '../services/input-schemas.js';

export async function generateCompanionSuggestion(env, record, recentRecords = []) {
  const provider = env.AI_PROVIDER || 'minimax';
  if (provider === 'minimax') {
    return generateMiniMaxSuggestion(env, record, recentRecords);
  }

  return generateOpenAISuggestion(env, record, recentRecords);
}

export async function generatePeriodReviewDraft(env, context) {
  const provider = env.AI_PROVIDER || 'minimax';
  if (provider === 'minimax') {
    return generateMiniMaxPeriodReview(env, context);
  }

  return generateOpenAIPeriodReview(env, context);
}

export async function generateAnalysisDraft(env, context) {
  const provider = env.AI_PROVIDER || 'minimax';
  if (provider === 'minimax') {
    return generateMiniMaxAnalysis(env, context);
  }

  return generateOpenAIAnalysis(env, context);
}

async function generateMiniMaxSuggestion(env, record, recentRecords = []) {
  if (!env.MINIMAX_API_KEY) {
    return failedSuggestion(env, 'MiniMax API key is not configured');
  }

  const model = env.MINIMAX_MODEL || 'MiniMax-M3';
  const baseUrl = env.MINIMAX_API_BASE_URL || 'https://api.minimaxi.com/v1';
  const prompt = buildCompanionPrompt(record, recentRecords);

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.MINIMAX_API_KEY}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: '你只输出可解析的 JSON，不要输出 Markdown，不要输出代码块。'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.4
      })
    });

    if (!response.ok) {
      return failedSuggestion(env, `MiniMax request failed: ${response.status}`);
    }

    const raw = await response.json();
    const text = raw.choices?.[0]?.message?.content || '';
    const parsed = JSON.parse(extractJsonText(text));
    return normalizeSuggestion(env, parsed, raw);
  } catch (error) {
    return failedSuggestion(env, error.message);
  }
}

async function generateMiniMaxPeriodReview(env, context) {
  if (!env.MINIMAX_API_KEY) {
    return failedPeriodReviewDraft(env, context, 'MiniMax API key is not configured');
  }

  const model = env.MINIMAX_MODEL || 'MiniMax-M3';
  const baseUrl = env.MINIMAX_API_BASE_URL || 'https://api.minimaxi.com/v1';
  const prompt = buildPeriodReviewPrompt(context);

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.MINIMAX_API_KEY}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: '你只输出可解析的 JSON，不要输出 Markdown，不要输出代码块。'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.35
      })
    });

    if (!response.ok) {
      return failedPeriodReviewDraft(env, context, `MiniMax request failed: ${response.status}`);
    }

    const raw = await response.json();
    const text = raw.choices?.[0]?.message?.content || '';
    const parsed = JSON.parse(extractJsonText(text));
    return normalizePeriodReviewDraft(env, context, parsed, raw);
  } catch (error) {
    return failedPeriodReviewDraft(env, context, error.message);
  }
}

async function generateMiniMaxAnalysis(env, context) {
  if (!env.MINIMAX_API_KEY) {
    return failedAnalysisDraft(env, context, 'MiniMax API key is not configured');
  }

  const model = env.MINIMAX_MODEL || 'MiniMax-M3';
  const baseUrl = env.MINIMAX_API_BASE_URL || 'https://api.minimaxi.com/v1';
  const prompt = buildAnalysisPrompt(context);

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.MINIMAX_API_KEY}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: '你只输出可解析的 JSON，不要输出 Markdown，不要输出代码块。'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.35
      })
    });

    if (!response.ok) {
      return failedAnalysisDraft(env, context, `MiniMax request failed: ${response.status}`);
    }

    const raw = await response.json();
    const text = raw.choices?.[0]?.message?.content || '';
    const parsed = JSON.parse(extractJsonText(text));
    return normalizeAnalysisDraft(env, context, parsed, raw);
  } catch (error) {
    return failedAnalysisDraft(env, context, error.message);
  }
}

async function generateOpenAISuggestion(env, record, recentRecords = []) {
  if (!env.OPENAI_API_KEY) {
    return failedSuggestion(env, 'OpenAI API key is not configured');
  }

  const model = env.OPENAI_MODEL || 'gpt-4.1-mini';
  const prompt = buildCompanionPrompt(record, recentRecords);

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.OPENAI_API_KEY}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: 'system',
            content: '你只输出可解析的 JSON。'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        text: {
          format: {
            type: 'json_object'
          }
        }
      })
    });

    if (!response.ok) {
      return failedSuggestion(env, `OpenAI request failed: ${response.status}`);
    }

    const raw = await response.json();
    const text = extractOutputText(raw);
    const parsed = JSON.parse(extractJsonText(text));
    return normalizeSuggestion(env, parsed, raw);
  } catch (error) {
    return failedSuggestion(env, error.message);
  }
}

async function generateOpenAIPeriodReview(env, context) {
  if (!env.OPENAI_API_KEY) {
    return failedPeriodReviewDraft(env, context, 'OpenAI API key is not configured');
  }

  const model = env.OPENAI_MODEL || 'gpt-4.1-mini';
  const prompt = buildPeriodReviewPrompt(context);

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.OPENAI_API_KEY}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: 'system',
            content: '你只输出可解析的 JSON。'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        text: {
          format: {
            type: 'json_object'
          }
        }
      })
    });

    if (!response.ok) {
      return failedPeriodReviewDraft(env, context, `OpenAI request failed: ${response.status}`);
    }

    const raw = await response.json();
    const text = extractOutputText(raw);
    const parsed = JSON.parse(extractJsonText(text));
    return normalizePeriodReviewDraft(env, context, parsed, raw);
  } catch (error) {
    return failedPeriodReviewDraft(env, context, error.message);
  }
}

async function generateOpenAIAnalysis(env, context) {
  if (!env.OPENAI_API_KEY) {
    return failedAnalysisDraft(env, context, 'OpenAI API key is not configured');
  }

  const model = env.OPENAI_MODEL || 'gpt-4.1-mini';
  const prompt = buildAnalysisPrompt(context);

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.OPENAI_API_KEY}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: 'system',
            content: '你只输出可解析的 JSON。'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        text: {
          format: {
            type: 'json_object'
          }
        }
      })
    });

    if (!response.ok) {
      return failedAnalysisDraft(env, context, `OpenAI request failed: ${response.status}`);
    }

    const raw = await response.json();
    const text = extractOutputText(raw);
    const parsed = JSON.parse(extractJsonText(text));
    return normalizeAnalysisDraft(env, context, parsed, raw);
  } catch (error) {
    return failedAnalysisDraft(env, context, error.message);
  }
}

export function normalizeSuggestion(env, suggestion, rawResponse = null) {
  const nextSmallStep = String(suggestion.nextSmallStep || suggestion.next_small_step || '').trim();
  const suggestedProjects = toArray(suggestion.suggestedProjects || suggestion.suggested_projects);
  const structuredResult = normalizeStructuredResult(suggestion.structuredResult || suggestion.structured_result);
  const destinationSuggestions = toArray(suggestion.destinationSuggestions || suggestion.destination_suggestions);
  if (suggestedProjects.length) {
    structuredResult.suggestedProjects = suggestedProjects.slice(0, 5).map(String).filter(Boolean);
  }

  return validateAiSuggestionResult({
    provider: currentProvider(env),
    model: currentModel(env),
    status: nextSmallStep ? 'completed' : 'failed',
    summary: toText(suggestion.summary),
    validation: toText(suggestion.validation),
    emotionalRead: toText(suggestion.emotionalRead || suggestion.emotional_read),
    possibleNeed: toText(suggestion.possibleNeed || suggestion.possible_need),
    nextSmallStep: nextSmallStep || '先把这件事写成一个 25 分钟内能开始的小动作。',
    gentleReminder: toText(suggestion.gentleReminder || suggestion.gentle_reminder),
    encouragement: toText(suggestion.encouragement),
    suggestedTags: toArray(suggestion.suggestedTags || suggestion.suggested_tags),
    suggestedProjects,
    suggestedFollowUps: toArray(suggestion.suggestedFollowUps || suggestion.suggested_followups),
    structuredResult,
    destinationSuggestions,
    rawResponse,
    errorMessage: nextSmallStep ? null : 'AI response missed nextSmallStep'
  });
}

function normalizePeriodReviewDraft(env, context, draft, rawResponse = null) {
  const wins = toArray(draft.wins).slice(0, 6);
  const blockers = toArray(draft.blockers).slice(0, 6);
  const nextActions = toArray(draft.nextActions || draft.next_actions).slice(0, 6);

  return {
    provider: currentProvider(env),
    model: currentModel(env),
    status: 'completed',
    theme: toText(draft.theme) || `${context.periodLabel || '周期'}经营复盘`,
    summary: toText(draft.summary) || buildFallbackPeriodSummary(context),
    wins,
    blockers,
    nextActions,
    rawResponse,
    errorMessage: null
  };
}

function failedPeriodReviewDraft(env, context, message) {
  return {
    provider: currentProvider(env),
    model: currentModel(env),
    status: 'failed',
    theme: `${context.periodLabel || '周期'}经营复盘`,
    summary: buildFallbackPeriodSummary(context),
    wins: toArray(context.highlights?.wins).slice(0, 5),
    blockers: toArray(context.highlights?.blockers).slice(0, 5),
    nextActions: toArray(context.highlights?.nextActions).slice(0, 5),
    rawResponse: null,
    errorMessage: message
  };
}

function normalizeAnalysisDraft(env, context, draft, rawResponse = null) {
  const title = toText(draft.title) || defaultAnalysisTitle(context);
  const headline = toText(draft.headline) || toText(draft.summary) || defaultAnalysisHeadline(context);
  const nextActions = normalizeAnalysisActions(draft.nextActions || draft.next_actions, context).slice(0, 5);
  const highlights = context.highlights || {};
  const insights = {
    title,
    headline,
    summary: toText(draft.summary) || headline,
    facts: toTextArray(draft.facts).length ? toTextArray(draft.facts).slice(0, 6) : toTextArray(highlights.facts).slice(0, 6),
    state: toTextArray(draft.state).length ? toTextArray(draft.state).slice(0, 6) : toTextArray(highlights.state).slice(0, 6),
    progress: toTextArray(draft.progress).length ? toTextArray(draft.progress).slice(0, 6) : toTextArray(highlights.progress || highlights.wins).slice(0, 6),
    blockers: toTextArray(draft.blockers).length ? toTextArray(draft.blockers).slice(0, 6) : toTextArray(highlights.blockers).slice(0, 6),
    patterns: toTextArray(draft.patterns).length ? toTextArray(draft.patterns).slice(0, 6) : toTextArray(highlights.patterns).slice(0, 6),
    affirmation: toText(draft.affirmation),
    watchItems: toTextArray(draft.watchItems || draft.watch_items).length
      ? toTextArray(draft.watchItems || draft.watch_items).slice(0, 5)
      : toTextArray(highlights.watchItems).slice(0, 5),
    pauseSuggestions: toTextArray(draft.pauseSuggestions || draft.pause_suggestions).length
      ? toTextArray(draft.pauseSuggestions || draft.pause_suggestions).slice(0, 5)
      : toTextArray(highlights.pauseSuggestions).slice(0, 5)
  };

  return {
    provider: currentProvider(env),
    model: currentModel(env),
    status: 'completed',
    promptVersion: 'analysis-v1',
    metrics: context.metrics || {},
    insights,
    nextActions,
    rawResponse,
    errorMessage: null
  };
}

function failedAnalysisDraft(env, context, message) {
  const highlights = context.highlights || {};
  const nextActions = normalizeAnalysisActions(highlights.nextActions, context).slice(0, 5);
  const insights = {
    title: defaultAnalysisTitle(context),
    headline: defaultAnalysisHeadline(context),
    summary: buildFallbackAnalysisSummary(context),
    facts: toTextArray(highlights.facts).slice(0, 5),
    state: toTextArray(highlights.state).slice(0, 5),
    progress: toTextArray(highlights.progress || highlights.wins).slice(0, 5),
    blockers: toTextArray(highlights.blockers).slice(0, 5),
    patterns: toTextArray(highlights.patterns).slice(0, 5),
    affirmation: '你已经把真实数据留下来了，这一步本身就在降低混乱感。',
    watchItems: toTextArray(highlights.watchItems).slice(0, 5),
    pauseSuggestions: toTextArray(highlights.pauseSuggestions).slice(0, 5)
  };

  return {
    provider: currentProvider(env),
    model: currentModel(env),
    status: 'failed',
    promptVersion: 'analysis-v1',
    metrics: context.metrics || {},
    insights,
    nextActions,
    rawResponse: null,
    errorMessage: message
  };
}

function normalizeAnalysisActions(actions, context) {
  return toArray(actions)
    .map(item => {
      if (typeof item === 'string') {
        return {
          text: item,
          reason: '来自当前分析的下一步',
          priority: 'medium',
          domain: context.domain || null,
          size: '25min'
        };
      }

      const text = toText(item?.text || item?.title || item?.action);
      if (!text) return null;
      return {
        text,
        reason: toText(item.reason),
        priority: normalizePriority(item.priority),
        domain: toText(item.domain) || context.domain || null,
        project: toText(item.project),
        dueHint: toText(item.dueHint || item.due_hint),
        size: toText(item.size) || '25min'
      };
    })
    .filter(Boolean);
}

function normalizePriority(priority) {
  const value = String(priority || '').trim();
  return ['high', 'medium', 'low'].includes(value) ? value : 'medium';
}

function toTextArray(value) {
  return toArray(value).map(item => String(item || '').trim()).filter(Boolean);
}

function defaultAnalysisTitle(context) {
  if (context.scopeType === 'daily') return '今日分析';
  if (context.scopeType === 'domain') return '场景分析';
  if (context.scopeType === 'weekly') return '周度分析';
  if (context.scopeType === 'monthly') return '月度分析';
  if (context.scopeType === 'yearly') return '年度分析';
  return '经营分析';
}

function defaultAnalysisHeadline(context) {
  const metrics = context.metrics || {};
  if (context.scopeType === 'daily') {
    return `这天留下 ${metrics.recordCount || 0} 条记录，先把状态和下一步收束起来。`;
  }
  if (context.scopeType === 'domain') {
    return `近 ${context.windowDays || 7} 天这个场景有 ${metrics.recordCount || 0} 条记录，适合先看节奏和卡点。`;
  }
  if (context.scopeType === 'weekly') {
    return `这一周有 ${metrics.recordCount || 0} 条记录、${metrics.completedFollowups || 0} 个事项闭环，先看节奏和下周重点。`;
  }
  if (context.scopeType === 'monthly') {
    return `这个月有 ${metrics.recordCount || 0} 条记录、${metrics.contentSeeds || 0} 条内容素材，适合看主线和趋势。`;
  }
  if (context.scopeType === 'yearly') {
    return `这一年沉淀了 ${metrics.recordCount || 0} 条记录，适合看长期方向和反复模式。`;
  }
  return '这些记录已经可以形成一版经营判断。';
}

function buildFallbackAnalysisSummary(context) {
  const metrics = context.metrics || {};
  return [
    buildFallbackAnalysisScopeLine(context, metrics),
    metrics.averageEnergy != null ? `能量均值 ${metrics.averageEnergy}/5。` : '',
    'AI 分析暂时失败，先用已有事实生成一版可编辑草稿。'
  ].filter(Boolean).join('');
}

function buildFallbackAnalysisScopeLine(context, metrics) {
  if (context.scopeType === 'daily') {
    return `这天记录 ${metrics.recordCount || 0} 条，新增待办 ${metrics.newFollowups || 0} 个。`;
  }
  if (context.scopeType === 'domain') {
    return `近 ${context.windowDays || 7} 天记录 ${metrics.recordCount || 0} 条，未闭环事项 ${metrics.openFollowups || 0} 个。`;
  }
  if (context.scopeType === 'weekly') {
    return `这一周记录 ${metrics.recordCount || 0} 条，闭环 ${metrics.completedFollowups || 0} 个事项。`;
  }
  if (context.scopeType === 'monthly') {
    return `这个月记录 ${metrics.recordCount || 0} 条，内容素材 ${metrics.contentSeeds || 0} 条。`;
  }
  if (context.scopeType === 'yearly') {
    return `这一年记录 ${metrics.recordCount || 0} 条，长期未闭环事项 ${metrics.longOpenFollowups || 0} 个。`;
  }
  return `这一周期记录 ${metrics.recordCount || 0} 条，未闭环事项 ${metrics.openFollowups || 0} 个。`;
}

function buildFallbackPeriodSummary(context) {
  const metrics = context.metrics || {};
  return [
    `${context.periodLabel || '这一周期'}保存了 ${metrics.reviewDays || 0} 天每日复盘，沉淀 ${metrics.achievementCount || 0} 个成果。`,
    metrics.completedFollowups != null ? `待办闭环 ${metrics.completedFollowups}/${metrics.followupCount || 0}。` : '',
    metrics.averageEnergy != null ? `能量均值 ${metrics.averageEnergy}/5。` : '',
    '先基于这些事实保存一版草稿，再手动补充你的真实判断。'
  ].filter(Boolean).join('');
}

function failedSuggestion(env, message) {
  return {
    provider: currentProvider(env),
    model: currentModel(env),
    status: 'failed',
    summary: null,
    validation: null,
    emotionalRead: null,
    possibleNeed: null,
    nextSmallStep: '先保存下来就很好，建议稍后再生成下一小步。',
    gentleReminder: null,
    encouragement: null,
    suggestedTags: [],
    suggestedProjects: [],
    suggestedFollowUps: [],
    structuredResult: {},
    destinationSuggestions: [],
    rawResponse: null,
    errorMessage: message
  };
}

function normalizeStructuredResult(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item != null && item !== '')
      .map(([key, item]) => [key, normalizeStructuredValue(item)])
  );
}

function normalizeStructuredValue(value) {
  if (Array.isArray(value)) {
    return value.slice(0, 20).map(normalizeStructuredValue).filter(item => item != null && item !== '');
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .filter(([, item]) => item != null && item !== '')
      .map(([key, item]) => [key, normalizeStructuredValue(item)]));
  }
  if (value == null) return null;
  return typeof value === 'string' ? value.trim() : value;
}

function extractOutputText(response) {
  if (response.output_text) return response.output_text;

  const texts = [];
  for (const item of response.output || []) {
    for (const content of item.content || []) {
      if (content.type === 'output_text' && content.text) texts.push(content.text);
      if (content.type === 'text' && content.text) texts.push(content.text);
    }
  }
  return texts.join('\n').trim();
}

function extractJsonText(text) {
  const withoutThinking = String(text || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const fenced = withoutThinking.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : withoutThinking;
  const first = candidate.indexOf('{');
  const last = candidate.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) {
    return candidate.slice(first, last + 1);
  }
  return candidate;
}

function toText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function toArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  return [value];
}

function currentProvider(env) {
  return env.AI_PROVIDER || 'minimax';
}

function currentModel(env) {
  if (currentProvider(env) === 'minimax') return env.MINIMAX_MODEL || 'MiniMax-M3';
  return env.OPENAI_MODEL || 'gpt-4.1-mini';
}
