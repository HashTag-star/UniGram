"use client";
import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Megaphone, Plus, Trash2, ToggleLeft, ToggleRight, Calendar, Search } from "lucide-react";

interface CampusEvent {
  id: string;
  university: string;
  title: string;
  body: string | null;
  event_date: string | null;
  is_active: boolean;
  created_at: string;
}

export default function CampusContentPage() {
  const [events, setEvents] = useState<CampusEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const [form, setForm] = useState({
    university: "",
    title: "",
    body: "",
    event_date: "",
  });

  useEffect(() => { fetchEvents(); }, []);

  const fetchEvents = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("campus_events")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) setError(error.message);
    else setEvents(data || []);
    setLoading(false);
  };

  const addEvent = async () => {
    if (!form.university.trim() || !form.title.trim()) {
      setError("University and title are required.");
      return;
    }
    setAdding(true);
    setError(null);
    const { data, error } = await supabase
      .from("campus_events")
      .insert({
        university: form.university.trim(),
        title: form.title.trim(),
        body: form.body.trim() || null,
        event_date: form.event_date || null,
        is_active: true,
      })
      .select()
      .single();
    if (error) setError(error.message);
    else {
      setEvents(prev => [data, ...prev]);
      setForm({ university: "", title: "", body: "", event_date: "" });
    }
    setAdding(false);
  };

  const toggleActive = async (id: string, current: boolean) => {
    const { error } = await supabase
      .from("campus_events")
      .update({ is_active: !current })
      .eq("id", id);
    if (error) setError(error.message);
    else setEvents(prev => prev.map(e => e.id === id ? { ...e, is_active: !current } : e));
  };

  const deleteEvent = async (id: string, title: string) => {
    if (!confirm(`Delete "${title}"?`)) return;
    const { error } = await supabase.from("campus_events").delete().eq("id", id);
    if (error) setError(error.message);
    else setEvents(prev => prev.filter(e => e.id !== id));
  };

  const filtered = events.filter(e =>
    e.title.toLowerCase().includes(search.toLowerCase()) ||
    e.university.toLowerCase().includes(search.toLowerCase())
  );

  const active = events.filter(e => e.is_active).length;

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
          <Megaphone className="text-indigo-400" />
          Campus Content
        </h1>
        <p className="text-white/50 mt-1">
          Post events and announcements that appear in the discovery feed for new users.
          <span className="text-indigo-400 ml-2 font-semibold">{active} active</span>
        </p>
      </div>

      {/* Add form */}
      <div className="glass rounded-2xl p-6 space-y-4">
        <h2 className="text-sm font-bold text-white uppercase tracking-widest">Post New Event / Announcement</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input
            value={form.university}
            onChange={e => setForm(f => ({ ...f, university: e.target.value }))}
            placeholder="University (e.g. KNUST)"
            className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500/50"
          />
          <input
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder="Title (e.g. Mid-semester exams begin)"
            className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500/50"
          />
        </div>
        <textarea
          value={form.body}
          onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
          placeholder="Details (optional)"
          rows={3}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500/50 resize-none"
        />
        <div className="flex flex-col md:flex-row gap-3 items-start md:items-center">
          <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-4 py-3">
            <Calendar size={14} className="text-white/40" />
            <input
              type="date"
              value={form.event_date}
              onChange={e => setForm(f => ({ ...f, event_date: e.target.value }))}
              className="bg-transparent text-sm text-white focus:outline-none"
            />
          </div>
          <button
            onClick={addEvent}
            disabled={adding || !form.title.trim() || !form.university.trim()}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-bold px-6 py-3 rounded-xl transition-colors"
          >
            {adding
              ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <Plus size={16} />
            }
            Post
          </button>
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={16} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by title or university..."
          className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-indigo-500/50"
        />
      </div>

      {/* Events list */}
      <div className="glass rounded-3xl overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-white/5 bg-white/[0.02]">
              <th className="px-6 py-4 text-xs font-bold text-white/30 uppercase tracking-widest">Event</th>
              <th className="px-6 py-4 text-xs font-bold text-white/30 uppercase tracking-widest">University</th>
              <th className="px-6 py-4 text-xs font-bold text-white/30 uppercase tracking-widest">Date</th>
              <th className="px-6 py-4 text-xs font-bold text-white/30 uppercase tracking-widest">Status</th>
              <th className="px-6 py-4 text-xs font-bold text-white/30 uppercase tracking-widest">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {loading ? (
              <tr><td colSpan={5} className="px-6 py-12 text-center">
                <div className="flex justify-center"><div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>
              </td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={5} className="px-6 py-12 text-center text-white/30 text-sm">
                {events.length === 0 ? "No events posted yet." : "No events match your search."}
              </td></tr>
            ) : filtered.map(ev => (
              <tr key={ev.id} className="hover:bg-white/[0.02] transition-colors">
                <td className="px-6 py-4 max-w-xs">
                  <p className="text-white text-sm font-semibold">{ev.title}</p>
                  {ev.body && <p className="text-white/40 text-xs mt-0.5 line-clamp-1">{ev.body}</p>}
                </td>
                <td className="px-6 py-4 text-white/60 text-sm">{ev.university}</td>
                <td className="px-6 py-4 text-white/40 text-sm">
                  {ev.event_date
                    ? new Date(ev.event_date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                    : <span className="text-white/20">—</span>}
                </td>
                <td className="px-6 py-4">
                  <span className={`text-xs font-bold px-2 py-1 rounded-full ${ev.is_active ? 'bg-green-500/10 text-green-400' : 'bg-white/5 text-white/30'}`}>
                    {ev.is_active ? 'Active' : 'Hidden'}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => toggleActive(ev.id, ev.is_active)}
                      className="text-white/30 hover:text-indigo-400 transition-colors"
                      title={ev.is_active ? "Hide" : "Show"}
                    >
                      {ev.is_active ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                    </button>
                    <button
                      onClick={() => deleteEvent(ev.id, ev.title)}
                      className="text-white/30 hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
