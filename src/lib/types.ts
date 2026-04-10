export type AuthProvider = 'google' | 'apple';

export interface ODTokens {
  access_token: string;
  refresh_token: string;
}

export interface ClawTokens {
  access_token: string;
  refresh_token: string;
}

export interface Credentials {
  provider: AuthProvider;
  access_token: string;
  refresh_token: string;
  od_token?: string;
  od_refresh_token?: string;
  logged_in_at: string;
}

export interface PaymentGrantResult {
  payment_token?: string;
  auto_payment: boolean;
}

export interface AuthCodeLoginResult {
  access_token: string;
  refresh_token: string;
}

export interface AuthCodePaymentResult {
  one_time_pay_token?: string;
  auto_pay_enabled: boolean;
}

export interface UserInfo {
  id: string;
  email: string;
  name?: string;
  avatar?: string;
  [key: string]: unknown;
}

// --- Channel C: CLI Relay types ---

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
