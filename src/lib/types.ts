export type LoginChannel = 'wechat' | 'whatsapp';

// Bumped to 2 in CLI v1.0. Files written before v1.0 lack this field —
// getFreshCredentials() treats absence as "legacy v1" and forces a clean
// re-login (cheap, single browser scan).
export const CREDENTIALS_SCHEMA_VERSION = 2;

export interface Credentials {
  schema_version?: number;
  provider: LoginChannel | 'env';
  access_token: string;
  refresh_token: string;
  expires_at?: string;
  refresh_expires_at?: string;
  user_id?: string;
  logged_in_at: string;
}

// --- CLI Relay types ---

export interface RelaySessionResponse {
  session_id: string;
}

export interface RelayBalanceResponse {
  credits: number;
  membership: string;
  display_name?: string | null;
}

export interface Preferences {
  preferred_claude_model: string | null;
  preferred_codex_model: string | null;
  preferred_language: string | null;
}

export interface MeResponse {
  user_id: string | null;
  display_name: string | null;
  display_name_inited: boolean;
  credits: number;
  membership: string;
  channels: unknown;
  preferences: Preferences;
  created_at: string | null;
}

export interface DownloadUrlResponse {
  url: string;
  filename?: string;
  size?: number;
  expires_at?: string;
}

export interface SSEEvent {
  event: string;
  data: Record<string, unknown>;
}

export interface SessionInfo {
  session_id: string;
  created_at: string;
}

export interface SessionStore {
  last_session_id?: string;
  sessions: Record<string, SessionInfo>;
}

// --- Activity / Broadcast envelope (matches backend v2) ---

export interface ActivityActor {
  role_id: string;
  user_id?: string;
  display_name?: string | null;
  avatar_url?: string | null;
  url: string;
}

export interface ActivityTarget {
  type: string;
  id: string;
  label: string;
  url: string;
  detail?: string | null;
  owner_role_id?: string | null;
  user_id?: string | null;
  extra?: Record<string, unknown>;
}

export interface ActivityEnvelope {
  id: string;
  created_at: string;
  category: string;
  action: string;
  verb: { zh?: string; en?: string };
  actor: ActivityActor;
  target: ActivityTarget;
  visibility: 'public' | 'private';
  context?: Record<string, unknown>;
}

export interface ActivityListResponse {
  items: ActivityEnvelope[];
  next_cursor: string | null;
}
