export type LoginChannel = 'wechat' | 'whatsapp';

export interface Credentials {
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
