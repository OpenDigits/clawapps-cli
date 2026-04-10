export const CONFIG = {
  GOOGLE_CLIENT_ID: '89883978473-52rsbijnbti2lr3imsg9odjc04ulq1ds.apps.googleusercontent.com',

  OD_API_BASE: 'https://api.opendigits.ai/api/v1',
  CLAW_API_BASE: 'https://api.clawapps.ai/api/v1',

  // OD endpoints
  OD_GOOGLE_AUTH: 'https://api.opendigits.ai/api/v1/auth/oauth/google',
  OD_APPLE_AUTHORIZE: 'https://api.opendigits.ai/api/v1/auth/oauth/apple/authorize',

  // ClawApps endpoints
  CLAW_EXCHANGE: 'https://api.clawapps.ai/api/v1/auth/exchange',
  CLAW_ME: 'https://api.clawapps.ai/api/v1/auth/me',
  CLAW_REFRESH: 'https://api.clawapps.ai/api/v1/auth/refresh',
  CLAW_LOGOUT: 'https://api.clawapps.ai/api/v1/auth/logout',

  // Web
  CLAW_WEB_BASE: 'https://clawapps.ai',

  // Agent code endpoints
  AGENT_CREATE_LOGIN_CODE: 'https://api.clawapps.ai/api/v1/agent/create-login-code',
  AGENT_CREATE_PAYMENT_CODE: 'https://api.clawapps.ai/api/v1/agent/create-payment-code',
  AGENT_AUTH_CODE: 'https://api.clawapps.ai/api/v1/agent/auth-code',
  AUTH_POLL_INTERVAL_MS: 3 * 1000, // 3 seconds

  // Timeouts
  AUTH_TIMEOUT_MS: 3 * 60 * 1000, // 3 minutes

  // Credentials
  CREDENTIALS_DIR: '.clawapps',
  CREDENTIALS_FILE: 'credentials.json',

  // CLI Relay (Channel C)
  CLI_RELAY_BASE: 'https://api.clawapps.ai/cli/v1',
  CLI_CONNECT_TIMEOUT_MS: 30 * 1000,
  CLI_MESSAGE_TIMEOUT_MS: 5 * 60 * 1000,
  SESSIONS_FILE: 'sessions.json',
} as const;
