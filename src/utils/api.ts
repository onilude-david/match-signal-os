export const api = async <T,>(path: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });
  
  const body = await response.json().catch(() => ({}));
  
  if (!response.ok || body.ok === false) {
    throw new Error(body.error ?? `API request failed: ${response.status}`);
  }
  
  return body as T;
};
