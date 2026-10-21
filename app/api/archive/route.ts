import { env } from "cloudflare:workers";
import { requireArchiveUser } from "../../archive-auth";

export const dynamic = "force-dynamic";

type NoteInput = { id?: string; date?: string; text?: string; tag?: string };
type WorkInput = {
  id?: string; archive?: string; title?: string; english?: string; type?: string; year?: string;
  creator?: string; status?: string; rating?: string; quote?: string; color?: string;
  timelineColors?: string[]; coverImage?: string | null; createdAt?: string; completedAt?: string | null;
  lightDates?: string[]; notes?: NoteInput[];
};

const WORK_TYPES = new Set(["book", "movie", "documentary", "series", "other"]);
const WORK_STATUSES = new Set(["wish", "reading", "done", "paused"]);

function text(value: unknown, limit: number, fallback = "") {
  return typeof value === "string" ? value.trim().slice(0, limit) : fallback;
}

function isoDate(value: unknown, fallback = "") {
  const candidate = text(value, 10, fallback);
  return /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : fallback;
}

function safeId(value: unknown, fallback: string) {
  const candidate = text(value, 100, fallback);
  return /^[A-Za-z0-9_-]+$/.test(candidate) ? candidate : fallback;
}

function parseJsonArray(value: unknown): string[] {
  try {
    const parsed = JSON.parse(String(value ?? "[]"));
    return Array.isArray(parsed) ? parsed.map((item) => String(item)).slice(0, 8) : [];
  } catch {
    return [];
  }
}

function databaseError(error: unknown) {
  const message = error instanceof Error ? error.message : "服务器暂时无法读取档案";
  if (message.includes("no such table")) return "云端档案正在初始化，请稍后刷新页面";
  return message;
}

export async function GET() {
  const userId = await requireArchiveUser();
  if (!userId) return Response.json({ error: "请先登录后再打开私人档案" }, { status: 401 });
  if (!env.DB) return Response.json({ error: "云端数据库尚未连接" }, { status: 503 });

  try {
    const [settings, workRows, lightRows, noteRows] = await Promise.all([
      env.DB.prepare("SELECT revision, migrated_at FROM user_settings WHERE user_id = ?").bind(userId).first<{ revision: number; migrated_at: string | null }>(),
      env.DB.prepare("SELECT * FROM works WHERE user_id = ? ORDER BY CAST(archive AS INTEGER) DESC, created_at DESC").bind(userId).all<Record<string, unknown>>(),
      env.DB.prepare("SELECT work_id, light_date FROM light_days WHERE user_id = ? ORDER BY light_date").bind(userId).all<Record<string, unknown>>(),
      env.DB.prepare("SELECT id, work_id, note_date, body, tag FROM notes WHERE user_id = ? ORDER BY note_date, created_at").bind(userId).all<Record<string, unknown>>(),
    ]);

    const lights = new Map<string, string[]>();
    for (const row of lightRows.results) {
      const workId = String(row.work_id);
      lights.set(workId, [...(lights.get(workId) ?? []), String(row.light_date)]);
    }
    const notes = new Map<string, Array<{ id: string; date: string; text: string; tag: string }>>();
    for (const row of noteRows.results) {
      const workId = String(row.work_id);
      notes.set(workId, [...(notes.get(workId) ?? []), {
        id: String(row.id), date: String(row.note_date), text: String(row.body), tag: String(row.tag ?? ""),
      }]);
    }

    const works = workRows.results.map((row) => ({
      id: String(row.id), archive: String(row.archive), title: String(row.title), english: String(row.english),
      type: String(row.type), year: String(row.year ?? ""), creator: String(row.creator ?? ""),
      status: String(row.status), rating: String(row.rating ?? ""), quote: String(row.quote ?? ""),
      color: String(row.color), timelineColors: parseJsonArray(row.timeline_colors),
      coverImage: row.cover_key
        ? String(row.cover_key).startsWith("data:image/")
          ? String(row.cover_key)
          : `/api/covers/${encodeURIComponent(String(row.id))}?v=${encodeURIComponent(String(row.updated_at))}`
        : null,
      createdAt: String(row.created_at), completedAt: row.completed_at ? String(row.completed_at) : null,
      lightDates: lights.get(String(row.id)) ?? [], notes: notes.get(String(row.id)) ?? [],
    }));

    return Response.json({
      revision: settings?.revision ?? 0,
      migratedAt: settings?.migrated_at ?? null,
      state: { works, paletteVersion: 2 },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: databaseError(error) }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const userId = await requireArchiveUser();
  if (!userId) return Response.json({ error: "请先登录后再同步私人档案" }, { status: 401 });
  if (!env.DB) return Response.json({ error: "云端数据库尚未连接" }, { status: 503 });

  try {
    const payload = await request.json() as { revision?: number; state?: { works?: WorkInput[] }; migration?: boolean };
    const incomingWorks = Array.isArray(payload.state?.works) ? payload.state.works : [];
    if (incomingWorks.length > 500) return Response.json({ error: "一次最多同步 500 部作品" }, { status: 400 });

    const settings = await env.DB.prepare("SELECT revision FROM user_settings WHERE user_id = ?").bind(userId).first<{ revision: number }>();
    const currentRevision = settings?.revision ?? 0;
    if (!Number.isInteger(payload.revision) || payload.revision !== currentRevision) {
      return Response.json({ error: "另一台设备已更新档案", serverRevision: currentRevision }, { status: 409 });
    }

    const now = new Date().toISOString();
    const today = now.slice(0, 10);
    const existingRows = await env.DB.prepare("SELECT id, cover_key FROM works WHERE user_id = ?").bind(userId).all<{ id: string; cover_key: string | null }>();
    const existingCovers = new Map(existingRows.results.map((row) => [row.id, row.cover_key]));
    const retainedCoverKeys = new Set<string>();
    const normalized: Array<Required<Omit<WorkInput, "coverImage" | "notes">> & { coverKey: string | null; notes: Required<NoteInput>[] }> = [];

    for (let index = 0; index < incomingWorks.length; index += 1) {
      const input = incomingWorks[index];
      const id = safeId(input.id, `work-${index}-${Date.now()}`);
      let coverKey = existingCovers.get(id) ?? null;
      if (!input.coverImage) coverKey = null;
      else if (input.coverImage.startsWith("data:image/")) {
        decodeCover(input.coverImage);
        coverKey = input.coverImage;
      }
      if (coverKey) retainedCoverKeys.add(coverKey);

      const type = text(input.type, 20, "other");
      const status = text(input.status, 20, "wish");
      normalized.push({
        id, archive: text(input.archive, 12, String(index + 1).padStart(4, "0")), title: text(input.title, 200, "未命名作品"),
        english: text(input.english, 240, text(input.title, 200, "UNTITLED")), type: WORK_TYPES.has(type) ? type : "other",
        year: text(input.year, 16), creator: text(input.creator, 200), status: WORK_STATUSES.has(status) ? status : "wish",
        rating: text(input.rating, 8), quote: text(input.quote, 600), color: text(input.color, 20, "#D6E6E7"),
        timelineColors: Array.isArray(input.timelineColors) ? input.timelineColors.map((color) => text(color, 20)).filter(Boolean).slice(0, 8) : [],
        coverKey, createdAt: isoDate(input.createdAt, today), completedAt: input.completedAt ? isoDate(input.completedAt) : null,
        lightDates: Array.isArray(input.lightDates) ? [...new Set(input.lightDates.map((date) => isoDate(date)).filter(Boolean))].slice(0, 5000) : [],
        notes: Array.isArray(input.notes) ? input.notes.slice(0, 5000).map((note, noteIndex) => ({
          id: safeId(note.id, `${id}-note-${noteIndex}-${isoDate(note.date, today).replaceAll("-", "")}`),
          date: isoDate(note.date, today), text: text(note.text, 12000), tag: text(note.tag, 80),
        })) : [],
      });
    }

    const lightCount = normalized.reduce((total, work) => total + work.lightDates.length, 0);
    const noteCount = normalized.reduce((total, work) => total + work.notes.length, 0);
    if (lightCount + noteCount > 10000) return Response.json({ error: "这次同步的日期与便签数量过多" }, { status: 400 });

    const statements: D1PreparedStatement[] = [
      env.DB.prepare("INSERT INTO user_settings (user_id, revision, migrated_at, created_at, updated_at) VALUES (?, 0, NULL, ?, ?) ON CONFLICT(user_id) DO NOTHING").bind(userId, now, now),
      env.DB.prepare("DELETE FROM notes WHERE user_id = ? AND EXISTS (SELECT 1 FROM user_settings WHERE user_id = ? AND revision = ?)").bind(userId, userId, currentRevision),
      env.DB.prepare("DELETE FROM light_days WHERE user_id = ? AND EXISTS (SELECT 1 FROM user_settings WHERE user_id = ? AND revision = ?)").bind(userId, userId, currentRevision),
      env.DB.prepare("DELETE FROM works WHERE user_id = ? AND EXISTS (SELECT 1 FROM user_settings WHERE user_id = ? AND revision = ?)").bind(userId, userId, currentRevision),
    ];
    for (const work of normalized) {
      statements.push(env.DB.prepare("INSERT INTO works (id, user_id, archive, title, english, type, year, creator, status, rating, quote, color, timeline_colors, cover_key, created_at, completed_at, updated_at) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM user_settings WHERE user_id = ? AND revision = ?)")
        .bind(work.id, userId, work.archive, work.title, work.english, work.type, work.year, work.creator, work.status, work.rating, work.quote, work.color, JSON.stringify(work.timelineColors), work.coverKey, work.createdAt, work.completedAt, now, userId, currentRevision));
      for (const date of work.lightDates) statements.push(env.DB.prepare("INSERT INTO light_days (user_id, work_id, light_date, created_at) SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM user_settings WHERE user_id = ? AND revision = ?)").bind(userId, work.id, date, now, userId, currentRevision));
      for (const note of work.notes) statements.push(env.DB.prepare("INSERT INTO notes (id, user_id, work_id, note_date, body, tag, created_at, updated_at) SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM user_settings WHERE user_id = ? AND revision = ?)").bind(note.id, userId, work.id, note.date, note.text, note.tag, now, now, userId, currentRevision));
    }
    const nextRevision = currentRevision + 1;
    if (payload.migration) statements.push(env.DB.prepare("INSERT OR IGNORE INTO import_batches (id, user_id, work_count, light_count, note_count, created_at) SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM user_settings WHERE user_id = ? AND revision = ?)").bind(`initial-${currentRevision}`, userId, normalized.length, lightCount, noteCount, now, userId, currentRevision));
    statements.push(env.DB.prepare("UPDATE user_settings SET revision = ?, migrated_at = CASE WHEN ? THEN COALESCE(migrated_at, ?) ELSE migrated_at END, updated_at = ? WHERE user_id = ? AND revision = ?")
      .bind(nextRevision, payload.migration ? 1 : 0, now, now, userId, currentRevision));

    const results = await env.DB.batch(statements);
    const revisionUpdate = results.at(-1);
    if (revisionUpdate?.meta.changes !== 1) {
      const latest = await env.DB.prepare("SELECT revision FROM user_settings WHERE user_id = ?").bind(userId).first<{ revision: number }>();
      return Response.json({ error: "另一台设备已更新档案", serverRevision: latest?.revision ?? currentRevision }, { status: 409 });
    }
    if (env.BUCKET) {
      await Promise.all(existingRows.results
        .map((row) => row.cover_key)
        .filter((key): key is string => Boolean(key) && !String(key).startsWith("data:image/") && !retainedCoverKeys.has(String(key)))
        .map((key) => env.BUCKET!.delete(key)));
    }

    return Response.json({ revision: nextRevision, counts: { works: normalized.length, lights: lightCount, notes: noteCount } });
  } catch (error) {
    return Response.json({ error: databaseError(error) }, { status: 500 });
  }
}

function decodeCover(dataUrl: string) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) throw new Error("封面图片格式不受支持");
  const binary = atob(match[2]);
  if (binary.length > 768 * 1024) throw new Error("压缩后的封面图片请小于 768KB");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  const extension = match[1] === "image/png" ? "png" : match[1] === "image/webp" ? "webp" : "jpg";
  return { bytes, contentType: match[1], extension };
}
