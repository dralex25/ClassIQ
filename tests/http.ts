export const BASE_URL = process.env.CLASSIQ_BASE_URL ?? "http://127.0.0.1:3000";

export class ApiClient {
  cookies = "";

  async request<T = Record<string, unknown>>(path: string, init?: RequestInit): Promise<{ status: number; body: T }> {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        cookie: this.cookies,
        ...(init?.headers ?? {}),
      },
    });
    const setCookies = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
    if (setCookies.length) {
      const map = new Map<string, string>();
      for (const pair of this.cookies.split(";").map((s) => s.trim()).filter(Boolean)) {
        const eq = pair.indexOf("=");
        map.set(pair.slice(0, eq), pair.slice(eq + 1));
      }
      for (const raw of setCookies) {
        const kv = raw.split(";", 1)[0];
        const eq = kv.indexOf("=");
        map.set(kv.slice(0, eq), kv.slice(eq + 1));
      }
      this.cookies = [...map.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    }
    const body = (await res.json().catch(() => ({}))) as T;
    return { status: res.status, body };
  }

  login(email: string, password = "password") {
    return this.request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  }
}

export async function requireApi(): Promise<void> {
  try {
    const res = await fetch(`${BASE_URL}/health`);
    if (!res.ok) throw new Error(`health ${res.status}`);
  } catch {
    throw new Error(`ClassIQ API is not reachable at ${BASE_URL}. Keep \`npm run dev\` running, then retry \`npm test\`.`);
  }
}
