// Alternate numbers + last dialed number for a set of leads, formatted for Telegram.
// Numbers are written as +91XXXXXXXXXX so Telegram makes them tap-to-call.

export type Phonebook = Record<string, {
  alts: { name: string | null; designation: string | null; phone: string }[];
  lastDialed: { phone: string; at: string } | null;
}>;

export function digits(phone: string | null | undefined): string {
  const d = String(phone || "").replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) return d.slice(2);
  if (d.length === 11 && d.startsWith("0")) return d.slice(1);
  return d;
}

export function tel(phone: string | null | undefined): string {
  const d = digits(phone);
  return d.length === 10 ? `+91${d}` : String(phone || "");
}

// deno-lint-ignore no-explicit-any
export async function loadPhonebook(supabase: any, clientIds: string[]): Promise<Phonebook> {
  const book: Phonebook = {};
  if (!clientIds.length) return book;
  clientIds.forEach((id) => (book[id] = { alts: [], lastDialed: null }));

  const [{ data: alts }, { data: dialed }] = await Promise.all([
    supabase.from("lead_contacts").select("client_id, name, designation, phone, created_at")
      .in("client_id", clientIds).not("phone", "is", null).order("created_at"),
    supabase.from("contact_log").select("client_id, dialed_phone, contacted_at")
      .in("client_id", clientIds).not("dialed_phone", "is", null)
      .order("contacted_at", { ascending: false }).limit(1000),
  ]);
  // deno-lint-ignore no-explicit-any
  (alts || []).forEach((a: any) => { if (a.phone?.trim()) book[a.client_id]?.alts.push(a); });
  // deno-lint-ignore no-explicit-any
  (dialed || []).forEach((l: any) => {
    const entry = book[l.client_id];
    if (entry && !entry.lastDialed) entry.lastDialed = { phone: l.dialed_phone, at: l.contacted_at };
  });
  return book;
}

/** Lines listing every number for a lead, marking the one dialed last time. */
export function phoneLines(mainPhone: string | null, entry: Phonebook[string] | undefined): string[] {
  const numbers: { label: string; phone: string }[] = [];
  if (mainPhone) numbers.push({ label: "Main", phone: mainPhone });
  (entry?.alts || []).forEach((a) => {
    if (!numbers.some((n) => digits(n.phone) === digits(a.phone))) {
      numbers.push({ label: [a.name, a.designation ? `(${a.designation})` : ""].filter(Boolean).join(" ") || "Alternate", phone: a.phone });
    }
  });
  const last = entry?.lastDialed;
  const lines = numbers.map((n) => {
    const isLast = last && digits(last.phone) === digits(n.phone);
    return `☎️ ${n.label}: ${tel(n.phone)}${isLast && numbers.length > 1 ? "  ← last dialed" : ""}`;
  });
  if (last) {
    const when = new Date(last.at).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
    const match = numbers.find((n) => digits(n.phone) === digits(last.phone));
    lines.push(`Last dialed: ${match ? match.label : tel(last.phone)} on ${when}`);
  }
  return lines;
}
