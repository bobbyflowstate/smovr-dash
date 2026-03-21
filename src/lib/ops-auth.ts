import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const COOKIE_NAME = "ops_session";
const MAX_AGE_SECONDS = 8 * 60 * 60; // 8 hours

function getSecret(): Uint8Array {
  const secret = process.env.OPS_JWT_SECRET;
  if (!secret) {
    throw new Error("OPS_JWT_SECRET environment variable is not set");
  }
  return new TextEncoder().encode(secret);
}

export async function createOpsSession(email: string): Promise<string> {
  const token = await new SignJWT({ email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .setSubject(email)
    .sign(getSecret());

  return token;
}

export async function verifyOpsSession(
  token: string
): Promise<{ email: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: ["HS256"],
    });
    if (!payload.email || typeof payload.email !== "string") {
      return null;
    }
    return { email: payload.email };
  } catch {
    return null;
  }
}

export function setOpsSessionCookie(token: string) {
  const cookieStore = cookies();
  // cookies() returns a Promise in Next.js 15+ but is synchronous in 14
  const store = cookieStore instanceof Promise ? null : cookieStore;
  if (store) {
    store.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: MAX_AGE_SECONDS,
      path: "/ops",
    });
  }
  return {
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    maxAge: MAX_AGE_SECONDS,
    path: "/ops",
  };
}

export function clearOpsSessionCookie() {
  const cookieStore = cookies();
  const store = cookieStore instanceof Promise ? null : cookieStore;
  if (store) {
    store.delete(COOKIE_NAME);
  }
  return {
    name: COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    maxAge: 0,
    path: "/ops",
  };
}

export async function getOpsSessionFromCookies(): Promise<{
  email: string;
} | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(COOKIE_NAME);
  if (!cookie?.value) return null;
  return verifyOpsSession(cookie.value);
}

export { COOKIE_NAME };
