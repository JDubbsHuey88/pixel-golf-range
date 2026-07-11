import { NextRequest, NextResponse } from 'next/server';

/**
 * All mutating /api/* routes require `Authorization: Bearer <API_TOKEN>`.
 * Returns a 401/500 response when unauthorized, or null when OK.
 */
export function requireAuth(req: NextRequest): NextResponse | null {
  const token = process.env.API_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: 'Server misconfigured: API_TOKEN is not set' },
      { status: 500 },
    );
  }
  const header = req.headers.get('authorization') ?? '';
  if (header !== `Bearer ${token}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}
