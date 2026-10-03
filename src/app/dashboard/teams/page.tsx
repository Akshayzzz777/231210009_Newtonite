'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';

export default function TeamsPage() {
  const [teams, setTeams] = useState<Array<{ id: string; name: string; description?: string | null; myRole: string; _count: { members: number; workItems: number } }>>([]);
  const [form, setForm] = useState({ name: '', description: '' });
  const [message, setMessage] = useState<string | null>(null);
  async function load() { const data = await fetch('/api/teams').then((response) => response.json()); setTeams(data.teams || []); }
  // Load the authoritative team list once when the screen mounts.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, []);
  async function create(event: FormEvent) { event.preventDefault(); const response = await fetch('/api/teams', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) }); const data = await response.json(); if (!response.ok) { setMessage(data.error); return; } setForm({ name: '', description: '' }); setMessage(null); await load(); }
  return <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-6"><header><p className="text-sm text-primary font-medium">Identity and access</p><h1 className="text-3xl font-bold">Teams</h1><p className="text-muted-foreground mt-1">Organize ownership and membership around operational work.</p></header>{message && <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{message}</div>}<div className="grid lg:grid-cols-[1fr_320px] gap-6 items-start"><section className="grid sm:grid-cols-2 gap-4">{teams.map((team) => <Link key={team.id} href={`/dashboard/teams/${team.id}`} className="glass rounded-xl p-5 hover:border-primary/50"><div className="flex justify-between gap-3"><h2 className="font-semibold">{team.name}</h2><span className="text-xs text-muted-foreground">{team.myRole}</span></div><p className="text-sm text-muted-foreground mt-2">{team.description || 'No description'}</p><p className="text-xs text-muted-foreground mt-5">{team._count.members} members · {team._count.workItems} work items</p></Link>)}{teams.length === 0 && <p className="text-muted-foreground">No teams yet.</p>}</section><form onSubmit={create} className="glass rounded-xl p-5 space-y-4"><h2 className="font-semibold">Create team</h2><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Team name" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /><textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description" rows={3} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /><button className="w-full rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground">Create team</button></form></div></div>;
}
