// src/redact.mjs — 零依赖脱敏。所有对外输出（fixtures / miss 日志 / UI 原文）都过这一层。
const RULES = [
  { id: 'bearer', re: /\bBearer\s+[A-Za-z0-9._\-+/=]{8,}/g, to: 'Bearer [REDACTED]' },
  { id: 'sk', re: /\bsk-[A-Za-z0-9._\-]{8,}/g, to: 'sk-[REDACTED]' },
  { id: 'apikey', re: /\b(api[_-]?key|apiKey|token|access[_-]?token)\s*[:=]\s*["']?[A-Za-z0-9._\-+/=]{6,}["']?/gi, to: '$1=[REDACTED]' },
  { id: 'maskedkey', re: /\*{3,}[A-Za-z0-9]{3,}/g, to: '****[REDACTED]' },
  { id: 'requestid', re: /\b(request[_-]?id|retryId|callId|toolCallId|session-\w+)\s*[:=]\s*["']?[A-Za-z0-9._\-]{6,}["']?/gi, to: '$1=[ID]' },
  { id: 'uuid', re: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, to: '[UUID]' },
  { id: 'winpath-quoted', re: /"[A-Za-z]:\\(?:[^"\\]+\\)*[^"\\]+"/g, to: '"[PATH]"' },
  { id: 'winpath', re: /[A-Za-z]:\\(?:[^\\\s"']+\\)*[^\\\s"']+/g, to: '[PATH]' },
  { id: 'unixpath', re: /(?<![\w])\/(?:home|Users|tmp|var|etc)\/[^\s"']+/g, to: '[PATH]' },
  { id: 'phone', re: /(?<!\d)1[3-9]\d{9}(?!\d)/g, to: '[PHONE]' },
  { id: 'ipv4', re: /(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?![\d.])/g, to: '[IP]' },
];

/** @returns {{ text: string, redacted: boolean, hits: string[] }} */
export function redact(input) {
  const raw = typeof input === 'string' ? input : String(input ?? '');
  let text = raw;
  const hits = [];
  for (const rule of RULES) {
    rule.re.lastIndex = 0;
    const next = text.replace(rule.re, rule.to);
    if (next !== text) { hits.push(rule.id); text = next; }
    rule.re.lastIndex = 0;
  }
  return { text, redacted: hits.length > 0, hits };
}

export function hashMessage(input) {
  // FNV-1a 32bit，仅用于本地 miss 日志去重，非安全用途
  const s = typeof input === 'string' ? input : String(input ?? '');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
