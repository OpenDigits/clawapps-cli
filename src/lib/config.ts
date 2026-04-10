export const CONFIG = {
  // CLI Relay
  CLI_RELAY_BASE: 'https://api.clawapps.ai/cli/v1',
  CLI_CONNECT_TIMEOUT_MS: 30 * 1000,
  CLI_MESSAGE_TIMEOUT_MS: 5 * 60 * 1000,

  // Local storage
  CREDENTIALS_DIR: '.clawapps',
  CREDENTIALS_FILE: 'credentials.json',
  SESSIONS_FILE: 'sessions.json',
} as const;
