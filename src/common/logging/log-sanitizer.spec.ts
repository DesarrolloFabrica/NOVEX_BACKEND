import { sanitizeLogRecord, sanitizeLogValue } from './log-sanitizer';

describe('log-sanitizer', () => {
  it('redacta claves sensibles', () => {
    const sanitized = sanitizeLogRecord({
      authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9',
      password: 'secret123',
      geminiApiKey: 'AIza-test',
      event: 'login',
    });

    expect(sanitized.authorization).toBe('[REDACTED]');
    expect(sanitized.password).toBe('[REDACTED]');
    expect(sanitized.geminiApiKey).toBe('[REDACTED]');
    expect(sanitized.event).toBe('login');
  });

  it('redacta valores con patrón Bearer o connection string', () => {
    expect(sanitizeLogValue('Bearer abc.def.ghi')).toBe('[REDACTED]');
    expect(sanitizeLogValue('postgresql://user:pass@host:5432/db')).toBe(
      '[REDACTED]',
    );
  });

  it('trunca strings muy largos', () => {
    const longPrompt = 'x'.repeat(600);
    const sanitized = sanitizeLogValue(longPrompt);
    expect(typeof sanitized).toBe('string');
    expect(String(sanitized).endsWith('…[truncated]')).toBe(true);
  });
});
