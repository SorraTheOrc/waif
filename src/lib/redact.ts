// Redaction helper utilities used for sanitizing event bodies and logs

export function redactSecrets(text: string): string {
  if (!text || typeof text !== 'string') return text;

  // Limit extremely long bodies to a reasonable size for logs
  const MAX_LEN = 1000;
  let out = text;
  if (out.length > MAX_LEN) {
    const tail = out.length - MAX_LEN;
    out = out.slice(0, MAX_LEN) + `\n[TRUNCATED ${tail} chars]`;
  }

  // Common secret/token patterns
  // 1) Bearer tokens: "Bearer <token>"
  out = out.replace(/Bearer\s+[A-Za-z0-9\-\._~\+\/]+=*/gi, 'Bearer [REDACTED]');

  // 2) API keys and secrets in `key=...` or `"key": "..."` forms
  out = out.replace(/([a-zA-Z0-9_\-]*?(?:api[_-]?key|secret|token|access[_-]?token|sk)\b)\s*[:=]\s*(["']?)[A-Za-z0-9\-\._~\+\/=]{8,}\2/gi, '$1: [REDACTED]');

  // 3) Keys that look like `sk-` (OpenAI-like)
  out = out.replace(/\bsk-[A-Za-z0-9]{16,}\b/gi, 'sk-[REDACTED]');

  // 4) Long base64-like strings (very long continuous base64) -> redact first to avoid hex collisions
  out = out.replace(/\b(?:[A-Za-z0-9+\/=]{40,})\b/g, (m) => {
    // Skip if the token is hex-only (allow hex to be caught by hex rule)
    if (/^[a-f0-9]+$/i.test(m)) return m;
    return '[REDACTED_BASE64]';
  });

  // 5) Long hex/blob strings
  out = out.replace(/\b[a-f0-9]{32,}\b/gi, '[REDACTED_HEX]');

  // 6) Inline JSON fields with long text values; truncate values longer than 200 chars
  out = out.replace(/(\"(?:text|body|message|content)\"\s*:\s*\")(.*?)(\")/gis, (full, pre, val, post) => {
    if (!val) return full;
    const clean = val.length > 200 ? val.slice(0, 200) + '...[TRUNCATED]' : val;
    return pre + clean + post;
  });

  // 5) Inline JSON fields with long text values; truncate values longer than 200 chars
  out = out.replace(/(\"(?:text|body|message|content)\"\s*:\s*\")(.*?)(\")/gis, (full, pre, val, post) => {
    if (!val) return full;
    const clean = val.length > 200 ? val.slice(0, 200) + '...[TRUNCATED]' : val;
    return pre + clean + post;
  });

  // Defensive: collapse multiple whitespace to single where it helps readability
  out = out.replace(/\r?\n\s+/g, '\n');

  return out;
}

export default { redactSecrets };
