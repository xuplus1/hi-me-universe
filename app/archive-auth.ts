import { env } from "cloudflare:workers";
import { cookies } from "next/headers";

const SESSION_COOKIE = "hi_me_archive_session";
const SESSION_MESSAGE = "hi-me-owner-session-v1";
export const ARCHIVE_USER_ID = "owner";

function archiveKey(): string {
  return typeof env.ARCHIVE_KEY === "string" ? env.ARCHIVE_KEY : "";
}

function constantTimeEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

async function expectedSessionToken(): Promise<string> {
  const secret = archiveKey();
  if (!secret) return "";
  const encoder = new TextEncoder();
  const signingKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    signingKey,
    encoder.encode(SESSION_MESSAGE),
  );
  return btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

export async function verifyArchiveKey(candidate: string): Promise<boolean> {
  const secret = archiveKey();
  return secret.length >= 10 && constantTimeEqual(candidate, secret);
}

export async function createArchiveSessionToken(): Promise<string> {
  return expectedSessionToken();
}

export async function hasArchiveSession(): Promise<boolean> {
  const cookieStore = await cookies();
  const supplied = cookieStore.get(SESSION_COOKIE)?.value ?? "";
  const expected = await expectedSessionToken();
  return Boolean(expected) && constantTimeEqual(supplied, expected);
}

export async function requireArchiveUser(): Promise<string | null> {
  return (await hasArchiveSession()) ? ARCHIVE_USER_ID : null;
}

export function archiveSessionCookieName(): string {
  return SESSION_COOKIE;
}
