import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { loadPhonebook, phoneLines } from "./phonebook.ts";

serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const TELEGRAM_TOKEN = Deno.env.get("TELEGRAM_TOKEN") ?? "<set in deployed function>";
  const CHAT_ID = "933636460";

  const now = new Date();
  const istNow = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  const today = istNow.toISOString().slice(0, 10);
  const dateHeader = istNow.toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "Asia/Kolkata" });

  // New leads assigned for today (next_action_due = today, never contacted)
  const { count: newLeads } = await supabase
    .from("clients")
    .select("*", { count: "exact", head: true })
    .eq("stage", "lead")
    .is("last_contacted_at", null)
    .eq("next_action_due", today);

  const { count: followups } = await supabase.from("clients").select("*", { count: "exact", head: true }).in("stage", ["lead","contacted","proposal"]).not("next_action_due","is",null).lte("next_action_due", today);

  const { data: hotDeals } = await supabase.from("clients").select("name, potential_revenue").eq("temperature","hot").in("stage",["lead","contacted","proposal"]).not("next_action_due","is",null).lte("next_action_due", today).order("potential_revenue",{ascending:false}).limit(3);

  const { data: temps } = await supabase.from("clients").select("temperature").in("stage",["lead","contacted","proposal"]).not("next_action_due","is",null).lte("next_action_due", today);
  let hot=0,warm=0,cold=0;
  temps?.forEach((t: any) => { if(t.temperature==="hot") hot++; else if(t.temperature==="warm") warm++; else cold++; });

  const startOfMonth = new Date(istNow.getFullYear(), istNow.getMonth(), 1).toISOString();
  const { data: dealsData } = await supabase.from("deals").select("deal_value").gte("created_at", startOfMonth);
  let mtdRevenue = 0;
  dealsData?.forEach((d: any) => { mtdRevenue += Number(d.deal_value||0); });

  const endOfMonth = new Date(istNow.getFullYear(), istNow.getMonth()+1, 0).toISOString().slice(0,10);
  const { data: pendingPayments } = await supabase.from("payments").select("amount").eq("paid",false).lte("due_date", endOfMonth);
  let pendingTotal = 0;
  pendingPayments?.forEach((p: any) => { pendingTotal += Number(p.amount||0); });

  const target = 500000;
  const totalDays = new Date(istNow.getFullYear(), istNow.getMonth()+1, 0).getDate();
  const dayOfMonth = istNow.getDate();
  const remaining = Math.max(0, target - mtdRevenue);
  const daysLeft = Math.max(1, totalDays - dayOfMonth);
  const requiredPerDay = remaining > 0 ? Math.ceil(remaining / daysLeft) : 0;
  const pct = Math.min(100, Math.round((mtdRevenue/target)*100));
  const expPct = Math.round((dayOfMonth/totalDays)*100);
  const aheadOrBehind = pct >= expPct ? "on pace" : "behind pace";

  const { data: scheduledToday } = await supabase.from("clients").select("id, name, phone, next_action_time, temperature").in("stage",["lead","contacted","proposal"]).eq("next_action_due", today).not("next_action_time","is",null).order("next_action_time",{ascending:true});
  const book = await loadPhonebook(supabase, (scheduledToday || []).map((c: any) => c.id));

  // Countdown warnings
  const { data: deliveredDeals } = await supabase.from("deals").select("client_id, delivered_at, product_sold").eq("delivery_status", true).not("delivered_at", "is", null);
  const countdownWarnings: string[] = [];
  if (deliveredDeals && deliveredDeals.length > 0) {
    const clientIds = deliveredDeals.map((d: any) => d.client_id);
    const { data: activeClients } = await supabase.from("clients").select("id, name").in("id", clientIds);
    const clientMap: Record<string, string> = {};
    (activeClients || []).forEach((c: any) => { clientMap[c.id] = c.name; });
    for (const d of deliveredDeals) {
      const delivDate = new Date((d as any).delivered_at + 'T00:00:00+05:30');
      const todayDate = new Date(today + 'T00:00:00+05:30');
      const changesDays = Math.ceil((delivDate.getTime() + 30*86400000 - todayDate.getTime()) / 86400000);
      const supportDays = Math.ceil((delivDate.getTime() + 90*86400000 - todayDate.getTime()) / 86400000);
      const name = clientMap[(d as any).client_id] || 'Unknown';
      if (changesDays > 0 && changesDays <= 7) countdownWarnings.push(`🔧 ${name} — changes window expires in ${changesDays}d`);
      if (supportDays > 0 && supportDays <= 7) countdownWarnings.push(`💬 ${name} — support window expires in ${supportDays}d`);
    }
  }

  // Each scheduled call lists every number for the lead and which one was dialed last time
  const scheduledLines = scheduledToday?.length
    ? scheduledToday.map((c: any) => [
        `${c.next_action_time?.slice(0,5)}  ${c.name}${c.temperature === 'hot' ? ' (hot)' : ''}`,
        ...phoneLines(c.phone, book[c.id]).map((l) => `      ${l}`),
      ].join("\n")).join("\n")
    : "Nothing scheduled";

  const hotLines = hotDeals?.length
    ? hotDeals.map((d: any) => `${d.name} — ₹${Number(d.potential_revenue||0).toLocaleString('en-IN')}`).join("\n")
    : "None right now";

  const lines = [
    `*OpsCraft · ${dateHeader}*`,
    ``,
    `₹${mtdRevenue.toLocaleString('en-IN')} / ₹5L closed (${pct}%) — ${aheadOrBehind}`,
    requiredPerDay > 0 ? `Need ₹${requiredPerDay.toLocaleString('en-IN')}/day to close the gap` : `Target hit — keep going`,
    pendingTotal > 0 ? `₹${pendingTotal.toLocaleString('en-IN')} pending collection` : null,
    ``,
    `*Pipeline*`,
    `${newLeads ?? 0} new calls assigned today · ${followups ?? 0} total due (${hot} hot, ${warm} warm, ${cold} cold)`,
    ``,
    `*Hot deals*`,
    hotLines,
    ``,
    `*Calls today*`,
    scheduledLines,
    countdownWarnings.length > 0 ? `\n*Expiring soon*\n${countdownWarnings.join('\n')}` : null,
    ``,
    `Work hot deals first, then proposals, then new leads.`,
  ].filter((l: any) => l !== null).join("\n");

  await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: CHAT_ID, text: lines, parse_mode: "Markdown" }),
  });

  return new Response("ok");
});
