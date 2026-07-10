export class ValidationError extends Error {
  constructor(issues) {
    super('Request validation failed');
    this.name = 'ValidationError';
    this.issues = issues;
  }
}

export function validateObject(input, fields, options = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const output = {};
  const issues = [];

  for (const [name, rules] of Object.entries(fields)) {
    const value = source[name];
    if (value == null || value === '') {
      if (rules.required) issues.push(issue(name, 'required', `${name} is required`));
      if (rules.default !== undefined) output[name] = rules.default;
      continue;
    }

    const parsed = validateField(name, value, rules, issues);
    if (parsed !== undefined) output[name] = parsed;
  }

  if (options.passthrough) {
    for (const [name, value] of Object.entries(source)) {
      if (!(name in fields)) output[name] = value;
    }
  }

  if (issues.length) throw new ValidationError(issues);
  return output;
}

export function validationResponse(error, fail) {
  if (!(error instanceof ValidationError)) return null;
  return fail(400, 'VALIDATION_FAILED', '输入内容不符合要求', error.issues);
}

function validateField(name, value, rules, issues) {
  if (rules.type === 'string') {
    if (typeof value !== 'string') {
      issues.push(issue(name, 'type', `${name} must be a string`));
      return undefined;
    }
    const result = rules.trim === false ? value : value.trim();
    if (rules.minLength != null && result.length < rules.minLength) {
      issues.push(issue(name, 'min_length', `${name} is too short`));
    }
    if (rules.maxLength != null && result.length > rules.maxLength) {
      issues.push(issue(name, 'max_length', `${name} is too long`));
    }
    if (rules.pattern && !rules.pattern.test(result)) {
      issues.push(issue(name, 'format', `${name} has an invalid format`));
    }
    if (rules.enum && !rules.enum.includes(result)) {
      issues.push(issue(name, 'enum', `${name} is not an allowed value`));
    }
    return result;
  }

  if (rules.type === 'number') {
    const result = Number(value);
    if (!Number.isFinite(result)) {
      issues.push(issue(name, 'type', `${name} must be a number`));
      return undefined;
    }
    if (rules.integer && !Number.isInteger(result)) issues.push(issue(name, 'integer', `${name} must be an integer`));
    if (rules.min != null && result < rules.min) issues.push(issue(name, 'min', `${name} is too small`));
    if (rules.max != null && result > rules.max) issues.push(issue(name, 'max', `${name} is too large`));
    return result;
  }

  if (rules.type === 'array') {
    if (!Array.isArray(value)) {
      issues.push(issue(name, 'type', `${name} must be an array`));
      return undefined;
    }
    if (rules.maxItems != null && value.length > rules.maxItems) {
      issues.push(issue(name, 'max_items', `${name} contains too many items`));
    }
    return value;
  }

  if (rules.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      issues.push(issue(name, 'type', `${name} must be an object`));
      return undefined;
    }
    return value;
  }

  return value;
}

function issue(path, code, message) {
  return { path, code, message };
}
