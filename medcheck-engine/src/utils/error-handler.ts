import type { Context } from 'hono';

export function handleApiError(c: Context, error: unknown, status: 400 | 404 | 500 = 500) {
  const message = error instanceof Error ? error.message : String(error);
  return c.json({ success: false, error: message }, status);
}
