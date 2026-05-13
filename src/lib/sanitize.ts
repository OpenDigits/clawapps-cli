/**
 * Sanitization helpers for backend-controlled strings that flow to stdout.
 *
 * Security context (C1 / C10, 2026-05-13 pentest):
 *
 * Automated AI agents pipe CLI stdout into upstream LLMs. Backend-controlled
 * text fields (message, content, intro, error.message, etc.) can carry:
 *   - ANSI escape sequences → terminal pollution / fake prompts
 *   - Prompt-injection payloads ("<system>...", "Ignore previous ...")
 *   - Invisible Unicode (tag chars, zero-width, RTL override) → LLM sees
 *     a different string than a human eye does
 *
 * stripDangerous() removes the bytes that cause those classes of attack.
 * It is intentionally conservative — only categories with no legitimate
 * use in chat content are stripped. Plain UTF-8 text (CJK, emoji, etc.)
 * survives untouched.
 *
 * pickAllowed() is a small white-list destructure helper for relay msg
 * frames so unknown / attacker-injected fields cannot reach jsonOut().
 */

// CSI / OSC / ESC-based ANSI sequences.
const ANSI_RE = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-_]/g;

// C0 control bytes except \t \n \r, plus DEL.
const CTRL_RE = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g;

// Invisible / direction-overriding Unicode that an LLM may tokenize but a
// human-rendered terminal will not show:
//   - zero-width / joiner / non-joiner / BOM
//   - bidi LRO / RLO / LRE / RLE / PDF
//   - bidi LRI / RLI / FSI / PDI
//   - tag-character block (U+E0000..U+E007F)
const INVISIBLE_RE = /[​-‏‪-‮⁦-⁩﻿]|[\u{E0000}-\u{E007F}]/gu;

export function stripDangerous(s: unknown): string {
  if (typeof s !== 'string') return typeof s === 'undefined' || s === null ? '' : String(s);
  return s.replace(ANSI_RE, '').replace(CTRL_RE, '').replace(INVISIBLE_RE, '');
}

/**
 * Return a new object containing only the listed string keys, with each
 * value passed through stripDangerous when it is a string. Nested objects
 * and arrays are passed through as-is (caller decides whether to recurse).
 *
 * Unknown keys are dropped silently — the whole point of the white-list.
 */
export function pickAllowed<T extends object>(src: T, keys: readonly (keyof T)[]): Partial<T> {
  const out: Partial<T> = {};
  for (const k of keys) {
    const v = src[k];
    if (v === undefined) continue;
    if (typeof v === 'string') {
      (out[k] as unknown) = stripDangerous(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Truncate error messages and scrub internal infrastructure identifiers.
 * Used for `err.message` that gets surfaced to stdout — the message may
 * contain DSN strings, internal hostnames, IPs, or stack traces.
 */
export function safeErrorMessage(err: unknown, max = 200): string {
  const raw = err instanceof Error ? err.message : String(err);
  const stripped = stripDangerous(raw);
  // Replace internal-looking tokens so AI pipelines don't ingest infra hints.
  const scrubbed = stripped
    .replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(?::\d+)?\b/g, '[ip]')
    .replace(/\b(?:postgres|psql|redis|mysql|mongodb|memcached):\/\/\S+/gi, '[dsn]')
    .replace(/\b(?:ECONNREFUSED|ENOTFOUND|EAI_AGAIN)\s+\S+/g, '$&'.split(' ')[0] + ' [host]');
  return scrubbed.length > max ? scrubbed.slice(0, max - 1) + '…' : scrubbed;
}
