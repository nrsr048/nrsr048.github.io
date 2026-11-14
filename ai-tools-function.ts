// Supabase Edge Function: "ai-tools" — Kalkulyator (matematika, rasm) va Assistent (test yaratish) uchun Claude.
// Secrets: ANTHROPIC_API_KEY (majburiy), AI_MODEL (ixtiyoriy, standart: claude-sonnet-5-5)
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const LANG: Record<string, string> = { uz: "Uzbek (Latin script)", ru: "Russian", tr: "Turkish", en: "English", tg: "Tajik (Cyrillic)", de: "German", ko: "Korean" };
const hits = new Map<string, { n: number; t: number }>();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST kerak" }, 405);

  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const u = await fetch(`${Deno.env.get("SUPABASE_URL")}/auth/v1/user`, { headers: { apikey: Deno.env.get("SUPABASE_ANON_KEY") || "", Authorization: `Bearer ${token}` } });
  if (!token || !u.ok) return json({ error: "Avval akkauntga kiring" }, 401);
  const user = await u.json();
  const now = Date.now(), h = hits.get(user.id) || { n: 0, t: now };
  if (now - h.t > 3600_000) { h.n = 0; h.t = now; }
  if (++h.n > 60) return json({ error: "Soatiga 60 ta AI so'rov limiti tugadi" }, 429);
  hits.set(user.id, h);

  // deno-lint-ignore no-explicit-any
  let b: any = {};
  try { b = await req.json(); } catch (_) { /* bo'sh */ }
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return json({ error: "ANTHROPIC_API_KEY o'rnatilmagan" }, 500);
  const lang = LANG[String(b.lang)] || LANG.uz;
  const model = Deno.env.get("AI_MODEL") || "claude-sonnet-5-5";
  const mode = String(b.mode || "");
  const q = String(b.q || "").slice(0, 4000);
  const img = typeof b.image === "string" && b.image.length < 2_500_000 ? b.image : "";
  if (!["math", "quiz"].includes(mode)) return json({ error: "Noto'g'ri rejim" }, 400);
  if (!q && !img) return json({ error: "So'rov yo'q" }, 400);

  const system = mode === "math"
    ? `You are a careful math tutor inside a student app. Solve the problem the user gives (text and/or a photo of a handwritten or printed problem). ` +
      `Reply ONLY with a JSON object: {"problem":"the problem written in plain text","steps":["short step 1","short step 2",...],"answer":"final answer"}. ` +
      `Write steps in ${lang}. Keep steps concise (max 8). Use plain text math (x^2, sqrt(), fractions like 3/4). If the image has no math problem, set "answer" to a short note saying so.`
    : `You create study quizzes. From the topic, text or photo given, write between 5 and ${Math.min(20, Math.max(5, parseInt(b.n) || 8))} multiple-choice questions in ${lang}. ` +
      `Reply ONLY with JSON: {"name":"short test title","questions":[{"q":"question","multi":false,"a":[{"t":"option","ok":true},{"t":"option","ok":false}]}]}. ` +
      `Each question has 3-4 options; exactly one correct unless "multi" is true. Only use facts you are confident are correct.`;
  const content: unknown[] = [];
  if (img) content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: img } });
  content.push({ type: "text", text: q || (mode === "math" ? "Solve the problem in the photo." : "Make a quiz from the photo.") });

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model, max_tokens: 1800, system, messages: [{ role: "user", content }] }),
  });
  if (!r.ok) return json({ error: r.status === 401 ? "Anthropic kaliti noto'g'ri" : r.status === 429 ? "AI limiti vaqtincha tugadi" : `AI xatosi (${r.status})` }, 502);
  const j = await r.json();
  // deno-lint-ignore no-explicit-any
  const text = (j.content || []).filter((x: any) => x.type === "text").map((x: any) => x.text).join("").trim();
  const m = text.match(/\{[\s\S]*\}/);
  try {
    const o = JSON.parse(m ? m[0] : text);
    if (mode === "math") return json({ problem: String(o.problem || ""), steps: (o.steps || []).map(String).slice(0, 10), answer: String(o.answer || "") });
    // deno-lint-ignore no-explicit-any
    const qs = (o.questions || []).slice(0, 20).map((x: any) => ({ q: String(x.q || ""), multi: !!x.multi, a: (x.a || []).slice(0, 6).map((a: any) => ({ t: String(a.t || ""), ok: !!a.ok })) }))
      // deno-lint-ignore no-explicit-any
      .filter((x: any) => x.q && x.a.length >= 2 && x.a.some((a: any) => a.ok));
    return json({ name: String(o.name || "AI test"), questions: qs });
  } catch (_) {
    return json(mode === "math" ? { problem: q, steps: [], answer: text.slice(0, 600) } : { error: "AI javobini o'qib bo'lmadi" }, mode === "math" ? 200 : 502);
  }
});
