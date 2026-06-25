import { buildCompanionPrompt } from '../prompts/companion.js';

export async function generateCompanionSuggestion(env, record, recentRecords = []) {
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
    const parsed = JSON.parse(text);
    return normalizeSuggestion(env, parsed, raw);
  } catch (error) {
    return failedSuggestion(env, error.message);
  }
}

export function normalizeSuggestion(env, suggestion, rawResponse = null) {
  const nextSmallStep = String(suggestion.nextSmallStep || suggestion.next_small_step || '').trim();

  return {
    provider: env.AI_PROVIDER || 'openai',
    model: env.OPENAI_MODEL || 'gpt-4.1-mini',
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
    provider: env.AI_PROVIDER || 'openai',
    model: env.OPENAI_MODEL || 'gpt-4.1-mini',
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
