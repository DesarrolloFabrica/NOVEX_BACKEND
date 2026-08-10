const SENSITIVE_KEY_PATTERN =
  /authorization|password|secret|token|cookie|api[_-]?key|credential|jwt|gemini|connection|dsn/i;

const SENSITIVE_VALUE_PATTERNS = [
  /^Bearer\s+/i,
  /^ya29\./i,
  /postgresql:\/\//i,
];

export function sanitizeLogValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    if (SENSITIVE_VALUE_PATTERNS.some((pattern) => pattern.test(value))) {
      return '[REDACTED]';
    }
    if (value.length > 500) {
      return `${value.slice(0, 120)}…[truncated]`;
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeLogValue(item));
  }

  if (typeof value === 'object') {
    return sanitizeLogRecord(value as Record<string, unknown>);
  }

  return value;
}

export function sanitizeLogRecord(
  record: Record<string, unknown>,
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(record)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      sanitized[key] = '[REDACTED]';
      continue;
    }
    sanitized[key] = sanitizeLogValue(value);
  }

  return sanitized;
}
