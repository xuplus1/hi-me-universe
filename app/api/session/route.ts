import { cookies } from "next/headers";
import {
  archiveSessionCookieName,
  createArchiveSessionToken,
  verifyArchiveKey,
} from "../../archive-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let key = "";
  try {
    const payload = (await request.json()) as { key?: unknown };
    key = typeof payload.key === "string" ? payload.key.slice(0, 256) : "";
  } catch {
    return Response.json({ error: "请求格式不正确" }, { status: 400 });
  }

  if (!(await verifyArchiveKey(key))) {
    return Response.json({ error: "档案钥匙不正确" }, { status: 401 });
  }

  const token = await createArchiveSessionToken();
  const cookieStore = await cookies();
  cookieStore.set(archiveSessionCookieName(), token, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return Response.json({ ok: true });
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.set(archiveSessionCookieName(), "", {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return Response.json({ ok: true });
}
