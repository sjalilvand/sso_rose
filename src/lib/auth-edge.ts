import { SignJWT, jwtVerify } from "jose";

// ماژول سازگار با Edge Runtime — فقط jose (بدون crypto و Prisma)

const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || "rose-hub-dev-secret-change-in-production-2024"
);

export const SESSION_COOKIE = "rose_hub_session";

export interface SessionPayload {
  sub: string; // userId
  jti: string; // sessionId
  role: string;
  name: string;
}

export async function signSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer("rose-hub")
    .setExpirationTime("7d")
    .sign(SECRET);
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET, { issuer: "rose-hub" });
    if (!payload.sub || !payload.jti) return null;
    return {
      sub: payload.sub,
      jti: payload.jti as string,
      role: String(payload.role || ""),
      name: String(payload.name || ""),
    };
  } catch {
    return null;
  }
}
