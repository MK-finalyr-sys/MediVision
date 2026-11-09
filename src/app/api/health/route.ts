import { db } from "@/db";
import { sql } from "drizzle-orm";
export const dynamic = "force-dynamic";
export async function GET() {
  // The private browser app does not require a database. Preserve the platform's
  // real PostgreSQL health check whenever its connection is configured.
  if (!process.env.DATABASE_URL) return Response.json({ ok: true, core: "on-device", database: "not configured; optional" });
  try { await db.execute(sql`select 1`); return Response.json({ ok: true, core: "on-device", database: "connected" }); }
  catch { return Response.json({ ok: false, error: "Configured database is unavailable; on-device tools are unaffected." }, { status: 500 }); }
}
