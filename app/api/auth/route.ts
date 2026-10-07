import { authenticateFirebaseRequest } from "@/lib/firebase-auth-server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const authentication = await authenticateFirebaseRequest(request);
  if (!authentication.ok)
    return Response.json({ error: authentication.error }, { status: authentication.status });

  const { uid, email, displayName } = authentication.user;
  return Response.json({ user: { uid, email, displayName } });
}