import { env } from "cloudflare:workers";
import { requireArchiveUser } from "../../../archive-auth";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const userId = await requireArchiveUser();
  if (!userId) return new Response("Unauthorized", { status: 401 });
  if (!env.DB || !env.BUCKET) return new Response("Storage unavailable", { status: 503 });

  const { id } = await context.params;
  const row = await env.DB.prepare("SELECT cover_key FROM works WHERE user_id = ? AND id = ?").bind(userId, id).first<{ cover_key: string | null }>();
  if (!row?.cover_key) return new Response("Not found", { status: 404 });
  const object = await env.BUCKET.get(row.cover_key);
  if (!object) return new Response("Not found", { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Cache-Control", "private, max-age=86400");
  headers.set("ETag", object.httpEtag);
  return new Response(object.body, { headers });
}
