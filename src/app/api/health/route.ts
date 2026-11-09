export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ ok: true, core: "on-device", database: "not configured; optional" });
}
