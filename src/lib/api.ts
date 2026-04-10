export interface ApiResponse<T = unknown> {
  ok: boolean;
  status: number;
  data: T;
}

/** Wrapped response format: { code, message, data: T } */
export interface WrappedResponse<T = unknown> {
  code: string;
  message: string;
  data: T;
}

export async function apiPost<T = unknown>(
  url: string,
  body: Record<string, unknown>,
  token?: string,
): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const data = await res.json() as T;
  return { ok: res.ok, status: res.status, data };
}

export async function apiGet<T = unknown>(
  url: string,
  token: string,
): Promise<ApiResponse<T>> {
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  const data = await res.json() as T;
  return { ok: res.ok, status: res.status, data };
}
