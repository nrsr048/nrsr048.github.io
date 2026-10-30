// Supabase Edge Function: "search"  — Brave Search API proxy (kalit serverda yashirin turadi).
// Faqat tizimga kirgan foydalanuvchilar ishlata oladi.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST kerak" }, 405);

  // 1) Foydalanuvchi kirganini tekshiramiz (JWT)
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const url = Deno.env.get("SUPABASE_URL")!, anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const u = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anon, Authorization: `Bearer ${token}` } });
  if (!token || !u.ok) return json({ error: "Avval akkauntga kiring" }, 401);

  // 2) So'rov
  let body: { q?: string; page?: number; lang?: string } = {};
  try { body = await req.json(); } catch (_) { /* bo'sh */ }
  const q = String(body.q || "").trim().slice(0, 300);
  if (!q) return json({ error: "So'rov bo'sh" }, 400);
  const page = Math.min(Math.max(Number(body.page) || 0, 0), 8);
  const key = Deno.env.get("BRAVE_API_KEY");
  if (!key) return json({ error: "BRAVE_API_KEY o'rnatilmagan (Edge Function Secrets)" }, 500);

  const p = new URLSearchParams({ q, count: "10", offset: String(page), safesearch: "moderate" });
  const sl = ({ ru: "ru", tr: "tr", en: "en" } as Record<string, string>)[String(body.lang)];
  if (sl) p.set("search_lang", sl);

  // 3) Brave Search
  const r = await fetch(`https://api.search.brave.com/res/v1/web/search?${p}`, {
    headers: { Accept: "application/json", "X-Subscription-Token": key },
  });
  if (!r.ok) return json({ error: `Brave: HTTP ${r.status}` }, 502);
  const j = await r.json();
  const results = (j.web?.results || []).map((x: any) => ({
    title: x.title, url: x.url, desc: x.description,
    host: x.meta_url?.hostname || "", age: x.age || x.page_age || "",
  }));
  return json({ results });
});
