export type AuthenticatedFirebaseUser = {
  uid: string;
  email: string | null;
  displayName: string | null;
  idToken: string;
  projectId: string;
};

export type FirebaseAuthResult =
  | { ok: true; user: AuthenticatedFirebaseUser }
  | { ok: false; status: 401 | 503; error: "unauthorized" | "firebase-configuration" | "firebase-unavailable" };

type FirebaseLookupResponse = {
  users?: {
    localId?: string;
    email?: string;
    displayName?: string;
    disabled?: boolean;
  }[];
  error?: { message?: string };
};

export async function authenticateFirebaseRequest(request: Request): Promise<FirebaseAuthResult> {
  const authorization = request.headers.get("authorization");
  const idToken = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!idToken)
    return { ok: false, status: 401, error: "unauthorized" };

  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!apiKey || !projectId)
    return { ok: false, status: 503, error: "firebase-configuration" };

  let response: Response;
  let result: FirebaseLookupResponse | null;
  try {
    response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
        cache: "no-store",
      },
    );
    result = await response.json().catch(() => null);
  } catch {
    return { ok: false, status: 503, error: "firebase-unavailable" };
  }

  const firebaseUser = result?.users?.[0];
  if (!response.ok || !firebaseUser?.localId) {
    const firebaseError = result?.error?.message ?? "";
    if (/^(INVALID_ID_TOKEN|TOKEN_EXPIRED|USER_DISABLED|USER_NOT_FOUND|INVALID_ARGUMENT)/.test(firebaseError))
      return { ok: false, status: 401, error: "unauthorized" };

    console.error("Firebase ID token lookup failed", firebaseError || response.status);
    return { ok: false, status: 503, error: "firebase-unavailable" };
  }

  if (firebaseUser.disabled)
    return { ok: false, status: 401, error: "unauthorized" };

  return {
    ok: true,
    user: {
      uid: firebaseUser.localId,
      email: firebaseUser.email ?? null,
      displayName: firebaseUser.displayName ?? null,
      idToken,
      projectId,
    },
  };
}