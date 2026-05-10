export const CONFIG = {
  // Channel-aware BASE_URLs for cli-relay (resolved by lib/base-url.ts).
  //   wechat   → cli-relay.clawapps.cn   (CN-friendly ingress)
  //   whatsapp → cli-relay.clawapps.ai   (overseas ingress)
  // CLAWAPPS_API_URL env var overrides both (dev / custom deploys).
  // CLI never talks to api.clawapps.* directly — every call goes through
  // cli-relay. Open-source client carries no service-side secrets.
  BASE_URL_WECHAT: 'https://cli-relay.clawapps.cn',
  BASE_URL_WHATSAPP: 'https://cli-relay.clawapps.ai',

  CLI_CONNECT_TIMEOUT_MS: 30 * 1000,
  CLI_MESSAGE_TIMEOUT_MS: 5 * 60 * 1000,

  // Local storage
  CREDENTIALS_DIR: '.clawapps',
  CREDENTIALS_FILE: 'credentials.json',
  SESSIONS_FILE: 'sessions.json',
} as const;
