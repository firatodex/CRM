import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { digits, loadPhonebook, phoneLines } from "./phonebook.ts";
import { telegramToken } from "./tg.ts";

const CHAT_ID = "933636460";
let BOT_URL = ""; // set per request from the vault token

async function send(text: string) {
  await fetch(`${BOT_URL}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: "Markdown" }),
  });
}

serve(async (req) => {
  try {
    // Robustly parse body regardless of content-type
    let body: any = {};
    try {
      const raw = await req.text();
      if (raw) body = JSON.parse(raw);
    } catch (_) { /* ignore parse errors */ }

    const message = body?.message;
    const text = (message?.text || "").trim();
    const fromId = String(message?.from?.id || "");

    // Security: only respond to your own chat
    if (!text || fromId !== CHAT_ID) {
      return new Response("ok", { status: 200 });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    BOT_URL = `https://api.telegram.org/bot${await telegramToken(supabase)}`;

    const lower = text.toLowerCase();
    const istNow = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
    const today = istNow.toISOString().slice(0, 10);

    // ── /status ──────────────────────────────────────────────────────────
    if (lower === "/status" || lower === "status") {
      const [newLeadsRes, followupsRes, tempsRes, dealsRes, pendingRes] = await Promise.all([
        supabase.from("clients").select("*", { count: "exact", head: true }).eq("stage", "lead").is("last_contacted_at", null),
        supabase.from("clients").select("*", { count: "exact", head: true }).in("stage", ["lead","contacted","proposal"]).not("next_action_due","is",null).lte("next_action_due", today),
        supabase.from("clients").select("temperature").in("stage",["lead","contacted","proposal"]).not("next_action_due","is",null).lte("next_action_due", today),
        supabase.from("deals").select("deal_value").gte("created_at", new Date(istNow.getFullYear(), istNow.getMonth(), 1).toISOString()),
        supabase.from("payments").select("amount").eq("paid",false).lte("due_date", new Date(istNow.getFullYear(), istNow.getMonth()+1, 0).toISOString().slice(0,10)),
      ]);

      let hot=0, warm=0, cold=0;
      tempsRes.data?.forEach((t: any) => { if(t.temperature==="hot") hot++; else if(t.temperature==="warm") warm++; else cold++; });
      let mtdRevenue = 0;
      dealsRes.data?.forEach((d: any) => { mtdRevenue += Number(d.deal_value||0); });
      let pendingTotal = 0;
      pendingRes.data?.forEach((p: any) => { pendingTotal += Number(p.amount||0); });

      const target = 500000;
      const totalDays = new Date(istNow.getFullYear(), istNow.getMonth()+1, 0).getDate();
      const dayOfMonth = istNow.getDate();
      const remaining = Math.max(0, target - mtdRevenue);
      const daysLeft = Math.max(1, totalDays - dayOfMonth);
      const requiredPerDay = remaining > 0 ? Math.ceil(remaining / daysLeft) : 0;
      const pct = Math.min(100, Math.round((mtdRevenue/target)*100));
      const expPct = Math.round((dayOfMonth/totalDays)*100);
      const pace = pct >= expPct ? "on pace" : "behind pace";
      const dateStr = istNow.toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "Asia/Kolkata" });

      await send([
        `*OpsCraft · ${dateStr}*`,
        ``,
        `₹${mtdRevenue.toLocaleString('en-IN')} / ₹5L (${pct}%) — ${pace}`,
        requiredPerDay > 0 ? `Need ₹${requiredPerDay.toLocaleString('en-IN')}/day` : `Target hit`,
        pendingTotal > 0 ? `₹${pendingTotal.toLocaleString('en-IN')} pending collection` : null,
        ``,
        `*Pipeline*`,
        `${Math.min(newLeadsRes.count||0,30)} new · ${followupsRes.count??0} follow-ups (${hot} hot, ${warm} warm, ${cold} cold)`,
      ].filter(Boolean).join("\n"));
      return new Response("ok", { status: 200 });
    }

    // ── /lead [name or phone] ────────────────────────────────────────────
    if (lower.startsWith("/lead ") || lower.startsWith("lead ")) {
      const query = text.replace(/^\/lead /i, "").replace(/^lead /i, "").trim();
      if (!query) { await send("Usage: `/lead Kalpesh` or `/lead 98250`"); return new Response("ok", { status: 200 }); }

      const cols = "id, name, company, stage, temperature, phone, email, next_action, next_action_due, last_contacted_at, pain_point";
      let results: any[] = [];
      const q = digits(query);
      if (q.length >= 4 && /^[\d\s+()-]+$/.test(query)) {
        // Phone search: main number or any alternate number
        const { data: alt } = await supabase.from("lead_contacts").select("client_id").ilike("phone", `%${q.slice(-6)}%`).limit(10);
        const altIds = (alt || []).map((a: any) => a.client_id);
        const { data: byMain } = await supabase.from("clients").select(cols).ilike("phone", `%${q.slice(-6)}%`).not("stage", "eq", "dead").limit(3);
        const { data: byAlt } = altIds.length
          ? await supabase.from("clients").select(cols).in("id", altIds).not("stage", "eq", "dead").limit(3)
          : { data: [] };
        const seen = new Set<string>();
        results = [...(byMain || []), ...(byAlt || [])].filter((c: any) => !seen.has(c.id) && seen.add(c.id)).slice(0, 3);
      } else {
        const { data } = await supabase
          .from("clients")
          .select(cols)
          .or(`name.ilike.%${query}%,company.ilike.%${query}%`)
          .not("stage", "eq", "dead")
          .limit(3);
        results = data || [];
      }

      if (!results || results.length === 0) {
        await send(`No active lead found matching *${query}*`);
        return new Response("ok", { status: 200 });
      }

      const book = await loadPhonebook(supabase, results.map((c: any) => c.id));

      for (const c of results) {
        const temp = c.temperature === "hot" ? "🔥 Hot" : c.temperature === "warm" ? "🌤 Warm" : "❄️ Cold";
        const due = c.next_action_due ? new Date(c.next_action_due + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : null;
        const lastContact = c.last_contacted_at ? new Date(c.last_contacted_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "Never";

        const { data: lastLog } = await supabase
          .from("contact_log")
          .select("note, contacted_at")
          .eq("client_id", c.id)
          .order("contacted_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        await send([
          `*${c.name}*`,
          c.company || null,
          `Stage: ${c.stage} · ${temp}`,
          ...phoneLines(c.phone, book[c.id]),
          c.email ? `✉️ ${c.email}` : null,
          due ? `Next: ${c.next_action || "follow up"} — ${due}` : null,
          `Last contact: ${lastContact}`,
          lastLog?.note ? `_${lastLog.note.slice(0, 150)}${lastLog.note.length > 150 ? "..." : ""}_` : null,
          c.pain_point ? `Pain: ${c.pain_point}` : null,
        ].filter(Boolean).join("\n"));
      }
      return new Response("ok", { status: 200 });
    }

    // ── /log [name] | [note] ─────────────────────────────────────────────
    if (lower.startsWith("/log ") || lower.startsWith("log ")) {
      const rest = text.replace(/^\/log /i, "").replace(/^log /i, "").trim();
      let clientQuery = "";
      let note = "";

      if (rest.includes("|")) {
        clientQuery = rest.split("|")[0].trim();
        note = rest.split("|").slice(1).join("|").trim();
      } else {
        const parts = rest.split(" ");
        clientQuery = parts[0];
        note = parts.slice(1).join(" ");
      }

      if (!clientQuery || !note) {
        await send("Usage: `/log Kalpesh | Called, interested in demo`");
        return new Response("ok", { status: 200 });
      }

      const { data: results } = await supabase
        .from("clients")
        .select("id, name, company")
        .or(`name.ilike.%${clientQuery}%,company.ilike.%${clientQuery}%`)
        .not("stage", "eq", "dead")
        .limit(3);

      if (!results || results.length === 0) {
        await send(`No active lead found matching *${clientQuery}*`);
        return new Response("ok", { status: 200 });
      }

      if (results.length > 1) {
        const names = results.map((r: any, i: number) => `${i+1}. ${r.name} (${r.company || "no company"})`).join("\n");
        await send(`Multiple matches — be more specific:\n${names}`);
        return new Response("ok", { status: 200 });
      }

      const client = results[0];
      const now = new Date().toISOString();
      await supabase.from("contact_log").insert({
        id: crypto.randomUUID(),
        client_id: client.id,
        method: "Phone call",
        note,
        contacted_at: now,
        progress: false,
      });
      await supabase.from("clients").update({ last_contacted_at: now }).eq("id", client.id);
      await send(`✓ Logged for *${client.name}*\n_${note}_`);
      return new Response("ok", { status: 200 });
    }

    // ── unknown command ──────────────────────────────────────────────────
    await send(["*OpsCraft Bot*", "", "/status — pipeline snapshot", "/lead [name or phone] — look up a lead (all numbers + last dialed)", "/log [name] | [note] — log a call"].join("\n"));
    return new Response("ok", { status: 200 });

  } catch (err) {
    console.error("Bot error:", err);
    return new Response("ok", { status: 200 }); // Always return 200 to Telegram
  }
});
