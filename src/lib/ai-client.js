import { buildCompanionPrompt } from '../prompts/companion.js';

export async function generateCompanionSuggestion(env, record, recentRecords = []) {
  const provider = env.AI_PROVIDER || 'minimax';
  if (provider === 'minimax') {
    return generateMiniMaxSuggestion(env, record, recentRecords);
  }

  return generateOpenAISuggestion(env, record, recentRecords);
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

export function normalizeSuggestion(env, suggestion, rawResponse = null) {
  const nextSmallStep = String(suggestion.nextSmallStep || suggestion.next_small_step || '').trim();

  return {
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
    suggestedFollowUps: toArray(suggestion.suggestedFollowUps || suggestion.suggested_followups),
    rawResponse,
    errorMessage: nextSmallStep ? null : 'AI response missed nextSmallStep'
  };
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
    suggestedFollowUps: [],
    rawResponse: null,
    errorMessage: message
  };
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
