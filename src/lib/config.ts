export const CONFIG = {
  // Channel-aware BASE_URLs (resolved by lib/base-url.ts).
  // wechat   → CN-friendly (api.clawapps.cn)
  // whatsapp → overseas    (api.clawapps.ai)
  // env CLAWAPPS_API_URL overrides both (dev / custom deploys).
  BASE_URL_WECHAT: 'https://cli-relay.clawapps.cn',
  BASE_URL_WHATSAPP: 'https://cli-relay.clawapps.ai',
  // Legacy alias — kept for any external callers; prefer base-url.ts.
  BASE_URL: 'https://api.clawapps.ai',

  CLI_CONNECT_TIMEOUT_MS: 30 * 1000,
  CLI_MESSAGE_TIMEOUT_MS: 5 * 60 * 1000,

  // Local storage
  CREDENTIALS_DIR: '.clawapps',
  CREDENTIALS_FILE: 'credentials.json',
  SESSIONS_FILE: 'sessions.json',
} as const;
