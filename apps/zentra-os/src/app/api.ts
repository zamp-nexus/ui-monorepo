/**
 * Talking to the Investigation API.
 *
 * Extracted from `app.tsx` so the Draft Finding panel can follow a claim to
 * its evidence without importing the whole app — and so a failed request
 * carries its status. A caller that cannot tell 404 from 500 cannot tell
 * "you may not see this" from "something broke", and the two are different
 * things to tell a reader.
 */

export const apiUrl =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ??
  'http://localhost:8000';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export type TokenSource = () => Promise<string | null>;

export const requestJson = async <T,>(
  url: string,
  getToken: TokenSource,
  options?: RequestInit,
): Promise<T> => {
  const token = await getToken();
  const response = await fetch(`${apiUrl}${url}`, {
    ...options,
    headers: {
      ...(options?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as {
      detail?: string;
    } | null;
    throw new ApiError(
      error?.detail ?? 'ZentraOS could not complete this request.',
      response.status,
    );
  }
  return (await response.json()) as T;
};
