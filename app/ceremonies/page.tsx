"use client";

import { useEffect, useMemo, useState } from "react";

function todayYMD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function addDays(ymd: string, delta: number) {
  const [y, m, d] = ymd.split("-").map((x) => parseInt(x, 10));
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + delta);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export default function CeremoniesPage() {
  // Shared date for standups and chat
  const [date, setDate] = useState<string>(todayYMD());

  // Standups
  const [standups, setStandups] = useState<Array<{ user: string; yesterday: string; today: string; blockers: string; updated_at: string }>>([]);
  const [suYesterday, setSuYesterday] = useState("");
  const [suToday, setSuToday] = useState("");
  const [suBlockers, setSuBlockers] = useState("");
  const [suSaving, setSuSaving] = useState(false);

  // Chat
  const [messages, setMessages] = useState<Array<{ user: string; text: string; created_at: string }>>([]);
  const [chatText, setChatText] = useState("");
  const [chatSaving, setChatSaving] = useState(false);

  // Retro
  const [sprint, setSprint] = useState("current");
  const [retroItems, setRetroItems] = useState<Array<{ sprint: string; category: string; text: string; user: string; created_at: string }>>([]);
  const [retroCategory, setRetroCategory] = useState("went_well");
  const [retroText, setRetroText] = useState("");
  const [retroSaving, setRetroSaving] = useState(false);

  // Loaders
  useEffect(() => {
    loadStandups(date);
    loadChat(date);
  }, [date]);

  useEffect(() => {
    loadRetro(sprint);
  }, [sprint]);

  async function loadStandups(d: string) {
    try {
      const res = await fetch(`/api/ceremonies/standups?date=${encodeURIComponent(d)}`, { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      setStandups(json.entries || []);
    } catch {
      setStandups([]);
    }
  }

  async function saveStandup() {
    try {
      setSuSaving(true);
      const res = await fetch("/api/ceremonies/standups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, yesterday: suYesterday, today: suToday, blockers: suBlockers }),
      });
      if (!res.ok) throw new Error(await res.text());
      setSuYesterday("");
      setSuToday("");
      setSuBlockers("");
      await loadStandups(date);
    } catch {
      // no-op
    } finally {
      setSuSaving(false);
    }
  }

  async function loadChat(d: string) {
    try {
      const res = await fetch(`/api/ceremonies/chat?date=${encodeURIComponent(d)}`, { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      setMessages(json.messages || []);
    } catch {
      setMessages([]);
    }
  }

  async function postChat() {
    if (!chatText.trim()) return;
    try {
      setChatSaving(true);
      const res = await fetch("/api/ceremonies/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, text: chatText }),
      });
      if (!res.ok) throw new Error(await res.text());
      setChatText("");
      await loadChat(date);
    } catch {
      // no-op
    } finally {
      setChatSaving(false);
    }
  }

  async function loadRetro(sp: string) {
    try {
      const res = await fetch(`/api/ceremonies/retro?sprint=${encodeURIComponent(sp)}`, { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      setRetroItems(json.items || []);
    } catch {
      setRetroItems([]);
    }
  }

  async function postRetro() {
    if (!retroText.trim()) return;
    try {
      setRetroSaving(true);
      const res = await fetch("/api/ceremonies/retro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sprint, category: retroCategory, text: retroText }),
      });
      if (!res.ok) throw new Error(await res.text());
      setRetroText("");
      await loadRetro(sprint);
    } catch {
      // no-op
    } finally {
      setRetroSaving(false);
    }
  }

  const weekDays = useMemo(() => {
    // Build 7-day strip centered around current date
    return [-3, -2, -1, 0, 1, 2, 3].map((delta) => addDays(date, delta));
  }, [date]);

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Ceremonies</h1>
        <div className="text-gray-600 text-sm mt-1">Daily standups, team chat, and sprint retrospectives</div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Standups */}
        <section className="border rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-lg">Daily Standup</h2>
            <div className="flex items-center gap-2 text-sm">
              <button className="px-2 py-1 border rounded" onClick={() => setDate(addDays(date, -1))}>Prev</button>
              <div className="font-mono">{date}</div>
              <button className="px-2 py-1 border rounded" onClick={() => setDate(addDays(date, 1))}>Next</button>
            </div>
          </div>
          <div className="flex gap-2 mb-3">
            {weekDays.map((d) => (
              <button
                key={d}
                onClick={() => setDate(d)}
                className={`px-2 py-1 rounded border text-xs ${d === date ? "bg-blue-600 text-white border-blue-600" : "hover:bg-gray-50"}`}
              >
                {d.slice(5)}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-2 max-h-[55vh] overflow-auto">
              {standups.map((s, idx) => (
                <div key={idx} className="border rounded p-3 bg-white">
                  <div className="text-sm font-medium">@{s.user}</div>
                  <div className="mt-2 text-xs">
                    <div className="text-gray-600 font-semibold">Yesterday</div>
                    <div className="whitespace-pre-wrap">{s.yesterday || "—"}</div>
                  </div>
                  <div className="mt-2 text-xs">
                    <div className="text-gray-600 font-semibold">Today</div>
                    <div className="whitespace-pre-wrap">{s.today || "—"}</div>
                  </div>
                  <div className="mt-2 text-xs">
                    <div className="text-gray-600 font-semibold">Blockers</div>
                    <div className="whitespace-pre-wrap">{s.blockers || "—"}</div>
                  </div>
                  <div className="mt-2 text-[10px] text-gray-500">Updated {new Date(s.updated_at).toLocaleString()}</div>
                </div>
              ))}
              {standups.length === 0 && <div className="text-sm text-gray-500">No standups yet for this date.</div>}
            </div>

            <div className="border rounded p-3">
              <div className="text-sm font-medium mb-2">Your update for {date}</div>
              <div className="space-y-2 text-sm">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Yesterday</label>
                  <textarea value={suYesterday} onChange={(e) => setSuYesterday(e.target.value)} className="w-full border rounded px-3 py-2 h-20" />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Today</label>
                  <textarea value={suToday} onChange={(e) => setSuToday(e.target.value)} className="w-full border rounded px-3 py-2 h-20" />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Blockers</label>
                  <textarea value={suBlockers} onChange={(e) => setSuBlockers(e.target.value)} className="w-full border rounded px-3 py-2 h-20" />
                </div>
                <button onClick={saveStandup} disabled={suSaving} className="px-3 py-1.5 rounded bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-50">
                  {suSaving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Chat */}
        <section className="border rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-lg">Team Chat</h2>
            <div className="flex items-center gap-2 text-sm">
              <button className="px-2 py-1 border rounded" onClick={() => setDate(addDays(date, -1))}>Prev</button>
              <div className="font-mono">{date}</div>
              <button className="px-2 py-1 border rounded" onClick={() => setDate(addDays(date, 1))}>Next</button>
            </div>
          </div>

          <div className="space-y-2 max-h-[60vh] overflow-auto mb-3">
            {messages.map((m, idx) => (
              <div key={idx} className="border rounded p-3 bg-white">
                <div className="text-sm"><span className="font-medium">@{m.user}</span> <span className="text-[10px] text-gray-500">{new Date(m.created_at).toLocaleString()}</span></div>
                <div className="mt-1 text-sm whitespace-pre-wrap">{m.text}</div>
              </div>
            ))}
            {messages.length === 0 && <div className="text-sm text-gray-500">No messages yet.</div>}
          </div>

          <div className="flex gap-2">
            <input value={chatText} onChange={(e) => setChatText(e.target.value)} placeholder="Write a message" className="flex-1 border rounded px-3 py-2 text-sm" />
            <button onClick={postChat} disabled={chatSaving || !chatText.trim()} className="px-3 py-2 rounded bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-50">{chatSaving ? "Sending..." : "Send"}</button>
          </div>
        </section>

        {/* Retrospective */}
        <section className="border rounded-lg p-4 lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-lg">Retrospective</h2>
            <div className="flex items-center gap-2 text-sm">
              <label>Sprint</label>
              <input value={sprint} onChange={(e) => setSprint(e.target.value)} className="border rounded px-2 py-1" placeholder="e.g., Sprint-25.10" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {([
              { key: "went_well", title: "Went Well" },
              { key: "to_improve", title: "To Improve" },
              { key: "action_items", title: "Action Items" },
            ] as const).map((col) => (
              <div key={col.key} className="border rounded p-3 bg-white">
                <div className="font-medium text-sm mb-2">{col.title}</div>
                <div className="space-y-2 max-h-[40vh] overflow-auto">
                  {retroItems.filter((r) => r.category === col.key).map((r, idx) => (
                    <div key={idx} className="border rounded p-2">
                      <div className="text-xs">{r.text}</div>
                      <div className="text-[10px] text-gray-500 mt-1">@{r.user} • {new Date(r.created_at).toLocaleString()}</div>
                    </div>
                  ))}
                  {retroItems.filter((r) => r.category === col.key).length === 0 && (
                    <div className="text-xs text-gray-500">No items</div>
                  )}
                </div>

                <div className="mt-3">
                  <textarea value={retroCategory === col.key ? retroText : ""} onChange={(e) => { setRetroCategory(col.key); setRetroText(e.target.value); }} placeholder="Add item" className="w-full border rounded px-2 py-1 text-sm h-16" />
                  <button onClick={postRetro} disabled={retroSaving || (retroCategory !== col.key) || !retroText.trim()} className="mt-2 px-3 py-1.5 rounded bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-50">{retroSaving ? "Adding..." : "Add"}</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
