import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
const BACKEND_URL = (process.env.BACKEND_URL ?? 'http://localhost:8000').replace(/\/+$/, '');

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const res = await fetch(`${BACKEND_URL}/identify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
      cache: 'no-store',
    });
    if (!res.ok) {
      return NextResponse.json({ error: `backend_${res.status}`, engine: 'builtin' }, { status: res.status });
    }
    const data = await res.json();
    return NextResponse.json({ ...data, engine: 'backend-ner' });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'backend_offline';
    return NextResponse.json({ error: message, engine: 'builtin' }, { status: 503 });
  }
}
