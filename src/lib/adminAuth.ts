import { timingSafeEqual } from "node:crypto";

/** Server-side authorization; a hidden button is never a permission boundary. */
export function hasValidAdminToken(request: Request): boolean {
  const expected = (process.env.WORKSTATION_ADMIN_TOKEN || "").trim();
  const provided = (request.headers.get("x-workstation-admin-token") || "").trim();
  if (!expected || !provided) return false;
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  return expectedBuffer.length === providedBuffer.length && timingSafeEqual(expectedBuffer, providedBuffer);
}

export function requireAdmin(request: Request): Response | null {
  return hasValidAdminToken(request) ? null : Response.json(
    { error: "administrator authorization required" },
    { status: 401, headers: { "Cache-Control": "no-store" } }
  );
}
