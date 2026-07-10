import { validateObject } from '../lib/schema.js';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function validateRecordBody(input, options = {}) {
  const required = options.required !== false;
  return validateObject(input, {
    content: { type: 'string', required, minLength: 1, maxLength: 20000 },
    date: { type: 'string', pattern: DATE_PATTERN, maxLength: 10 },
    domain: { type: 'string', enum: ['work', 'side_business', 'life', 'content'] },
    type: { type: 'string', maxLength: 40 },
    summary: { type: 'string', maxLength: 2000 },
    visibility: { type: 'string', enum: ['private', 'public', 'shared'] },
    mood: { type: 'string', maxLength: 100 },
    energy: { type: 'number', integer: true, min: 1, max: 5 },
    projects: { type: 'array', maxItems: 20 },
    tags: { type: 'array', maxItems: 20 },
    nextActions: { type: 'array', maxItems: 50 },
    structuredPayload: { type: 'object' },
    destinations: { type: 'array', maxItems: 10 },
    taskTitle: { type: 'string', maxLength: 500 },
    dueDate: { type: 'string', pattern: DATE_PATTERN, maxLength: 10 },
    projectName: { type: 'string', maxLength: 200 },
    contentTitle: { type: 'string', maxLength: 500 }
  }, { passthrough: true });
}

export function validateAiSuggestionResult(input) {
  return validateObject(input, {
    provider: { type: 'string', required: true, maxLength: 100 },
    model: { type: 'string', required: true, maxLength: 200 },
    status: { type: 'string', required: true, enum: ['completed', 'failed'] },
    summary: { type: 'string', maxLength: 5000 },
    validation: { type: 'string', maxLength: 5000 },
    emotionalRead: { type: 'string', maxLength: 5000 },
    possibleNeed: { type: 'string', maxLength: 5000 },
    nextSmallStep: { type: 'string', required: true, maxLength: 5000 },
    gentleReminder: { type: 'string', maxLength: 5000 },
    encouragement: { type: 'string', maxLength: 5000 },
    suggestedTags: { type: 'array', maxItems: 20 },
    suggestedProjects: { type: 'array', maxItems: 5 },
    suggestedFollowUps: { type: 'array', maxItems: 20 },
    structuredResult: { type: 'object' },
    destinationSuggestions: { type: 'array', maxItems: 20 }
  }, { passthrough: true });
}

export function validateProjectBody(input, options = {}) {
  return validateObject(input, {
    name: { type: 'string', required: options.required !== false, minLength: 1, maxLength: 200 },
    slug: { type: 'string', maxLength: 200 },
    summary: { type: 'string', maxLength: 5000 },
    status: { type: 'string', enum: ['active', 'paused', 'completed', 'dropped'] },
    currentFocus: { type: 'string', maxLength: 2000 },
    nextAction: { type: 'string', maxLength: 2000 }
  }, { passthrough: true });
}

export function validateFollowupBody(input, options = {}) {
  return validateObject(input, {
    text: { type: 'string', required: options.required !== false, minLength: 1, maxLength: 2000 },
    note: { type: 'string', maxLength: 10000 },
    domain: { type: 'string', enum: ['work', 'side_business', 'life', 'content'] },
    project: { type: 'string', maxLength: 200 },
    status: { type: 'string', enum: ['open', 'deferred', 'closed', 'dropped'] },
    sourceRecordId: { type: 'string', maxLength: 100 },
    dueDate: { type: 'string', pattern: DATE_PATTERN, maxLength: 10 }
  }, { passthrough: true });
}

export function validateContentItemBody(input, options = {}) {
  return validateObject(input, {
    title: { type: 'string', required: options.required !== false, minLength: 1, maxLength: 500 },
    sourceDomain: { type: 'string', enum: ['work', 'side_business', 'life', 'content'] },
    status: { type: 'string', enum: ['idea', 'outline', 'drafting', 'published', 'dropped'] },
    angle: { type: 'string', maxLength: 5000 },
    outline: { type: 'array', maxItems: 100 },
    tags: { type: 'array', maxItems: 30 },
    nextAction: { type: 'string', maxLength: 2000 },
    sourceRecordId: { type: 'string', maxLength: 100 }
  }, { passthrough: true });
}
