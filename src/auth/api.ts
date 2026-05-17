export interface ClientUser {
  id: string;
  email: string;
  name: string;
  image: string | null;
  isDemo: boolean;
}

export async function fetchMe(): Promise<ClientUser | null> {
  const res = await fetch("/api/me", { credentials: "include" });
  if (!res.ok) return null;
  const data = (await res.json()) as { user: ClientUser | null };
  return data.user;
}

export async function signInDemo(): Promise<ClientUser> {
  const res = await fetch("/api/auth/demo", {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) throw new Error(`Demo sign-in failed: ${res.status}`);
  const data = (await res.json()) as { user: ClientUser };
  return data.user;
}

export async function signInEmail(email: string): Promise<ClientUser> {
  const res = await fetch("/api/auth/email", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(text || `Sign-in failed: ${res.status}`);
  }
  const data = (await res.json()) as { user: ClientUser };
  return data.user;
}

export async function signInGoogle(): Promise<void> {
  // Better Auth's social sign-in is a POST that returns the provider's
  // authorization URL — we then navigate the browser to it. Doing a direct
  // GET (as we used to) hits Better Auth as 404 because it doesn't expose a
  // GET initiator for /sign-in/social.
  const res = await fetch("/api/auth/sign-in/social", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: "google",
      callbackURL: window.location.origin + "/",
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Google sign-in init failed (${res.status}): ${text}`);
  }
  const data = (await res.json()) as { url?: string; redirect?: boolean };
  if (!data.url) {
    throw new Error("Google sign-in init returned no redirect URL");
  }
  window.location.href = data.url;
}

export async function signOut(): Promise<void> {
  // Hit both endpoints so a user from either flow lands signed out.
  await Promise.all([
    fetch("/api/auth/sign-out", { method: "POST", credentials: "include" }).catch(() => {}),
    fetch("/api/me/sign-out", { method: "POST", credentials: "include" }).catch(() => {}),
  ]);
}
