// Browser-side API helper. Mutations send the bearer token from
// NEXT_PUBLIC_API_TOKEN (the app itself is Tailscale-gated; no user login).

const TOKEN = process.env.NEXT_PUBLIC_API_TOKEN ?? '';

export async function apiGet<T = unknown>(path: string): Promise<T> {
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.json();
}

export async function apiSend<T = unknown>(
  path: string,
  body?: unknown,
  method: 'POST' | 'DELETE' | 'PATCH' = 'POST',
): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body instanceof FormData ? body : body != null ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `${method} ${path} → ${res.status}`);
  return data as T;
}
