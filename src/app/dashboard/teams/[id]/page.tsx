'use client';

import Link from 'next/link';
import { use, useEffect, useState } from 'react';

export default function TeamDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [members, setMembers] = useState<Array<{ id: string; role: string; user: { id: string; name?: string | null; email: string } }>>([]);
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  async function load() { const response = await fetch(`/api/teams/${id}/members`); const data = await response.json(); if (!response.ok) throw new Error(data.error); setMembers(data.members); }
  // Load membership from the server for the selected team.
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { load().catch((error: Error) => setMessage(error.message)); }, [id]);
  async function invite(event: React.FormEvent) { event.preventDefault(); const response = await fetch(`/api/teams/${id}/members`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) }); const data = await response.json(); if (!response.ok) { setMessage(data.error); return; } setEmail(''); setMessage(null); await load(); }
  return <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6"><Link href="/dashboard/teams" className="text-sm text-primary hover:underline">Back to teams</Link><header><h1 className="text-3xl font-bold">Team members</h1><p className="text-sm text-muted-foreground mt-1">Team ID: <code>{id}</code></p></header>{message && <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{message}</div>}<div className="grid md:grid-cols-[1fr_300px] gap-6 items-start"><section className="glass rounded-xl divide-y divide-border">{members.length === 0 ? <p className="p-5 text-sm text-muted-foreground">No team members found.</p> : members.map((member) => <div key={member.id} className="p-4 flex flex-wrap items-center justify-between gap-3"><div><p className="font-medium">{member.user.name || member.user.email}</p><p className="text-sm text-muted-foreground">{member.user.email}</p><p className="mt-1 text-xs text-muted-foreground">Login: <code>{member.role}@{member.user.id}</code></p></div><span className="text-xs rounded-full bg-muted px-2 py-1">{member.role}</span></div>)}</section><form onSubmit={invite} className="glass rounded-xl p-5 space-y-4"><h2 className="font-semibold">Invite member</h2><input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="colleague@company.com" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /><button className="w-full rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground">Invite</button></form></div></div>;
}
