import type { IncomingMessage, ServerResponse } from "node:http";
import { randomBytes, createHmac, timingSafeEqual } from "node:crypto";
const ephemeralSecret = randomBytes(32),
  pending = new Map<
    string,
    { provider: string; nonce: string; expires: number }
  >();
const providers = {
  kakao: {
    authorize: "https://kauth.kakao.com/oauth/authorize",
    token: "https://kauth.kakao.com/oauth/token",
    profile: "https://kapi.kakao.com/v2/user/me",
  },
};
function config(provider: string) {
  const prefix = provider.toUpperCase();
  return {
    id: process.env[`${prefix}_CLIENT_ID`],
    secret: process.env[`${prefix}_CLIENT_SECRET`],
  };
}
function origin() {
  return process.env.APP_ORIGIN || "http://localhost:3000";
}
function cookie(name: string, value: string, age: number) {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${origin().startsWith("https:") ? "; Secure" : ""}`;
}
function cookies(req: IncomingMessage) {
  return Object.fromEntries(
    (req.headers.cookie || "")
      .split(";")
      .map((s) => s.trim().split(/=(.*)/s).slice(0, 2)),
  );
}
function sign(value: string) {
  return createHmac("sha256", process.env.SESSION_SECRET || ephemeralSecret)
    .update(value)
    .digest("base64url");
}
function pack(data: unknown) {
  const body = Buffer.from(JSON.stringify(data)).toString("base64url");
  return body + "." + sign(body);
}
function unpack(value: string) {
  try {
    const [body, sig] = value.split("."),
      expected = sign(body);
    if (
      sig.length !== expected.length ||
      !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
    )
      return null;
    const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    return data.expires > Date.now() ? data : null;
  } catch {
    return null;
  }
}
export async function handleAuth(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
) {
  if (!url.pathname.startsWith("/auth/")) return false;
  const json = (status: number, data: unknown) => {
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(data));
    return true;
  };
  const redirect = (path: string, cookieValues?: string | string[]) => {
    res.writeHead(302, {
      Location: path,
      "Cache-Control": "no-store",
      ...(cookieValues ? { "Set-Cookie": cookieValues } : {}),
    });
    res.end();
    return true;
  };
  if (url.pathname === "/auth/me" && req.method === "GET")
    return json(200, {
      user: unpack(cookies(req).tarot_session)?.user || null,
      providers: { kakao: !!config("kakao").id },
    });
  if (url.pathname === "/auth/logout" && req.method === "POST") {
    if (req.headers.origin && req.headers.origin !== origin())
      return json(403, { error: "허용되지 않은 요청입니다." });
    res.setHeader("Set-Cookie", cookie("tarot_session", "", 0));
    return json(200, { ok: true });
  }
  const match = url.pathname.match(/^\/auth\/(kakao)(\/callback)?$/);
  if (!match || req.method !== "GET") return json(404, { error: "Not found" });
  const [, provider, callback] = match,
    settings = config(provider),
    p = providers[provider as keyof typeof providers];
  if (!settings.id)
    return redirect("/?auth_error=not_configured");
  const redirectUri = origin() + `/auth/${provider}/callback`;
  for (const [key, value] of pending)
    if (value.expires < Date.now()) pending.delete(key);
  if (!callback) {
    const state = randomBytes(24).toString("base64url"),
      nonce = randomBytes(24).toString("base64url");
    pending.set(state, { provider, nonce, expires: Date.now() + 600000 });
    const target = new URL(p.authorize);
    target.search = new URLSearchParams({
      response_type: "code",
      client_id: settings.id,
      redirect_uri: redirectUri,
      state,
    }).toString();
    return redirect(target.href, cookie("tarot_oauth", nonce, 600));
  }
  const state = url.searchParams.get("state"),
    attempt = pending.get(state || "");
  if (
    !attempt ||
    attempt.provider !== provider ||
    attempt.nonce !== cookies(req).tarot_oauth
  )
    return redirect("/?auth_error=invalid_state");
  pending.delete(state || "");
  if (url.searchParams.has("error") || !url.searchParams.get("code"))
    return redirect("/?auth_error=cancelled", cookie("tarot_oauth", "", 0));
  try {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: settings.id,
      code: url.searchParams.get("code")!,
      redirect_uri: redirectUri,
      state: state!,
    });
    if (settings.secret) body.set("client_secret", settings.secret);
    const response = await fetch(p.token, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        signal: AbortSignal.timeout(12000),
      }),
      tokens = await response.json();
    if (!response.ok || !tokens.access_token) throw Error("token");
    const profile = await fetch(p.profile, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
        signal: AbortSignal.timeout(12000),
      }),
      member = await profile.json();
    if (!profile.ok) throw Error("profile");
    if (!member?.id) throw Error("identity");
    const nickname = String(
      member.kakao_account?.profile?.nickname || member.properties?.nickname || "공주",
    ).slice(0, 40);
    const user = { id: `${provider}:${member.id}`, nickname, provider };
    return redirect("/", [
      cookie(
        "tarot_session",
        pack({ user, expires: Date.now() + 604800000 }),
        604800,
      ),
      cookie("tarot_oauth", "", 0),
    ]);
  } catch {
    return redirect("/?auth_error=failed", cookie("tarot_oauth", "", 0));
  }
}
