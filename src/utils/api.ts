// Single fetch wrapper for every API call, and the one place the API key is
// attached. The server enforces MATCH_SIGNAL_API_KEY when set (see
// server/config/auth.mjs); the frontend reads the matching key from:
//   1. localStorage "msos.apiKey" — set once in devtools:
//        localStorage.setItem("msos.apiKey", "<your key>")
//      (survives deploys, no rebuild needed)
//   2. VITE_API_KEY at build time — for baked single-operator deploys
//
// EventSource and <video src> can't send headers, so for those use
// withApiKey(url), which appends the key as a query parameter the server
// also accepts.

export const getApiKey = (): string => {
  try {
    const stored = localStorage.getItem("msos.apiKey");
    if (stored) return stored.trim();
  } catch {
    // SSR/test environments without localStorage
  }
  return (import.meta.env.VITE_API_KEY ?? "").trim();
};

export const withApiKey = (url: string): string => {
  const key = getApiKey();
  if (!key) return url;
  return `${url}${url.includes("?") ? "&" : "?"}apiKey=${encodeURIComponent(key)}`;
};

export const apiHeaders = (): Record<string, string> => {
  const key = getApiKey();
  return key ? { "x-api-key": key } : {};
};

export const api = async <T,>(path: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...apiHeaders(),
      ...(options?.headers ?? {}),
    },
  });

  const body = await response.json().catch(() => ({}));

  if (response.status === 401) {
    throw new Error(
      'API key required. Set it once in the browser console: localStorage.setItem("msos.apiKey", "<key from .env>")',
    );
  }
  if (!response.ok || body.ok === false) {
    throw new Error(body.error ?? `API request failed: ${response.status}`);
  }

  return body as T;
};
