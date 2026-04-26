export const CONFIG = {
  // Single base URL — CLI talks only to cli-relay (HTTP + WS) under /cli/v1/*.
  // Override via CLAWAPPS_API_URL.
  BASE_URL: 'https://api.clawapps.ai',

  CLI_CONNECT_TIMEOUT_MS: 30 * 1000,
  CLI_MESSAGE_TIMEOUT_MS: 5 * 60 * 1000,

  // Local storage
  CREDENTIALS_DIR: '.clawapps',
  CREDENTIALS_FILE: 'credentials.json',
  SESSIONS_FILE: 'sessions.json',
} as const;
