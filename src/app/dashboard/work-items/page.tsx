'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';

type Member = { userId: string; user: { id: string; name?: string | null; email: string } };
type Team = { id: string; name: string; members?: Member[] };
type WorkItem = {
  id: string;
  title: string;
  description?: string | null;
  type: string;
  status: string;
  priority: string;
  requiresApproval: boolean;
  dueDate?: string | null;
  team: { id: string; name: string };
  owner?: { id: string; name?: string | null; email: string } | null;
  creator: { id: string; name?: string | null; email: string };
};

const statuses = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'];
const priorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
const types = ['TASK', 'BUG', 'FEATURE', 'INCIDENT'];

const emptyForm = {
  title: '',
  description: '',
  type: 'TASK',
  priority: 'MEDIUM',
  status: 'TODO',
  teamId: '',
  ownerId: '',
  dueDate: '',
  requiresApproval: false,
};

function toIso(value: string) {
  return value ? new Date(value).toISOString() : null;
}

export default function WorkItemsPage() {
  const [items, setItems] = useState<WorkItem[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [type, setType] = useState('');
  const [teamId, setTeamId] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [sortBy, setSortBy] = useState('updatedAt');
  const [sortOrder, setSortOrder] = useState('desc');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const createInFlight = useRef(false);
  const idempotencyRequest = useRef<{ payload: string; key: string } | null>(null);

  const selectedTeam = teams.find((team) => team.id === form.teamId);

  function responseMessage(statusCode: number, error?: string) {
    if (statusCode === 401) return 'Your session has expired. Sign in again.';
    if (statusCode === 403) return 'You do not have access to that team or filter.';
    if (statusCode === 404) return 'The requested resource was not found.';
    if (statusCode === 409) return error || 'The item changed. Refresh and try again.';
    return error || 'The server could not complete the request.';
  }

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: '12' });
    if (search) params.set('search', search);
    if (status) params.set('status', status);
    if (priority) params.set('priority', priority);
    if (type) params.set('type', type);
    if (teamId) params.set('teamId', teamId);
    if (ownerId) params.set('ownerId', ownerId);
    params.set('sortBy', sortBy);
    params.set('sortOrder', sortOrder);
    try {
      const response = await fetch(`/api/work-items?${params}`);
      const data = await response.json();
      if (!response.ok) throw new Error(responseMessage(response.status, data.error));
      setItems(data.items);
      setPages(data.pagination.pages || 1);
      setTotal(data.pagination.total || 0);
      setMessage(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load work items.');
    } finally {
      setLoading(false);
    }
  }, [ownerId, page, priority, search, sortBy, sortOrder, status, teamId, type]);

  useEffect(() => {
    fetch('/api/teams').then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(responseMessage(response.status, data.error));
      const availableTeams = data.teams ?? [];
      setTeams(availableTeams);
      setForm((current) => ({ ...current, teamId: current.teamId || availableTeams[0]?.id || '' }));
    }).catch((error: Error) => setMessage(error.message));
  }, []);

  // The query synchronizes remote server state with this screen.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  async function createItem(event: FormEvent) {
    event.preventDefault();
    if (createInFlight.current) return;

    createInFlight.current = true;
    setCreating(true);
    setMessage(null);
    const payload = JSON.stringify({
      ...form,
      ownerId: form.ownerId || null,
      dueDate: toIso(form.dueDate),
    });
    const request = idempotencyRequest.current?.payload === payload
      ? idempotencyRequest.current
      : { payload, key: crypto.randomUUID() };
    idempotencyRequest.current = request;

    try {
      const response = await fetch('/api/work-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': request.key },
        body: payload,
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage(responseMessage(response.status, data.error));
        return;
      }

      idempotencyRequest.current = null;
      setForm((current) => ({ ...emptyForm, teamId: current.teamId }));
      setMessage('Work item created.');
      void load();
    } catch {
      setMessage('Unable to create the work item. Retry to safely check the result.');
    } finally {
      createInFlight.current = false;
      setCreating(false);
    }
  }

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="text-sm text-primary font-medium">Operations</p>
          <h1 className="text-3xl font-bold">Work items</h1>
          <p className="text-muted-foreground mt-1">Create, assign, claim, and move team work through a governed workflow.</p>
        </div>
        <div className="text-sm text-muted-foreground">{total} items · Page {page} of {pages}</div>
      </header>

      {message && <div role="status" className={`rounded-lg border px-4 py-3 text-sm ${message === 'Work item created.' ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600' : 'border-destructive/40 bg-destructive/10 text-destructive'}`}>{message}</div>}

      <div className="grid xl:grid-cols-[1fr_360px] gap-6 items-start">
        <section className="glass rounded-xl p-4 space-y-4">
          <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
            <input value={search} onChange={(e) => { setPage(1); setSearch(e.target.value); }} placeholder="Search title or description" className="sm:col-span-2 rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            <select value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }} className="rounded-lg border border-border bg-background px-3 py-2 text-sm"><option value="">All statuses</option>{statuses.map((value) => <option key={value}>{value}</option>)}</select>
            <select value={priority} onChange={(e) => { setPage(1); setPriority(e.target.value); }} className="rounded-lg border border-border bg-background px-3 py-2 text-sm"><option value="">All priorities</option>{priorities.map((value) => <option key={value}>{value}</option>)}</select>
            <select value={type} onChange={(e) => { setPage(1); setType(e.target.value); }} className="rounded-lg border border-border bg-background px-3 py-2 text-sm"><option value="">All types</option>{types.map((value) => <option key={value}>{value}</option>)}</select>
            <select value={teamId} onChange={(e) => { setPage(1); setTeamId(e.target.value); }} className="rounded-lg border border-border bg-background px-3 py-2 text-sm"><option value="">All teams</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select>
            <select value={ownerId} onChange={(e) => { setPage(1); setOwnerId(e.target.value); }} className="rounded-lg border border-border bg-background px-3 py-2 text-sm"><option value="">All owners</option><option value="unassigned">Unassigned</option>{Array.from(new Map(teams.flatMap((team) => team.members ?? []).map((member) => [member.userId, member])).values()).map((member) => <option key={member.userId} value={member.userId}>{member.user.name || member.user.email}</option>)}</select>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">Sort<select value={sortBy} onChange={(e) => { setPage(1); setSortBy(e.target.value); }} className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-foreground"><option value="updatedAt">Recently updated</option><option value="createdAt">Created</option><option value="title">Title</option><option value="priority">Priority</option><option value="dueDate">Due date</option></select></label>
            <select aria-label="Sort direction" value={sortOrder} onChange={(e) => { setPage(1); setSortOrder(e.target.value); }} className="rounded-lg border border-border bg-background px-3 py-2 text-sm"><option value="desc">Descending</option><option value="asc">Ascending</option></select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border text-left text-muted-foreground"><th className="p-3">Work item</th><th className="p-3">Type</th><th className="p-3">Team</th><th className="p-3">Owner</th><th className="p-3">Due</th><th className="p-3">Status</th><th className="p-3">Priority</th></tr></thead>
              <tbody>{items.map((item) => <tr key={item.id} className="border-b border-border/60 hover:bg-muted/30"><td className="p-3 min-w-72"><Link className="font-medium hover:text-primary" href={`/dashboard/work-items/${item.id}`}>{item.title}</Link><p className="text-xs text-muted-foreground truncate max-w-sm">{item.description || 'No description'}</p>{item.requiresApproval && <p className="text-xs text-amber-400 mt-1">Approval required</p>}</td><td className="p-3">{item.type}</td><td className="p-3 text-muted-foreground">{item.team.name}</td><td className="p-3 text-muted-foreground">{item.owner?.name || item.owner?.email || 'Unassigned'}</td><td className="p-3 text-muted-foreground">{item.dueDate ? new Date(item.dueDate).toLocaleDateString() : 'None'}</td><td className="p-3"><span className="rounded-full px-2 py-1 text-xs bg-muted">{item.status.replace('_', ' ')}</span></td><td className="p-3">{item.priority}</td></tr>)}</tbody>
            </table>
            {loading && <p className="p-8 text-center text-sm text-muted-foreground">Loading work items...</p>}
            {!loading && items.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">No work items match these filters.</p>}
          </div>

          <div className="flex justify-between">
            <button disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="rounded-lg border border-border px-3 py-2 text-sm disabled:opacity-40">Previous</button>
            <button disabled={page >= pages} onClick={() => setPage((value) => value + 1)} className="rounded-lg border border-border px-3 py-2 text-sm disabled:opacity-40">Next</button>
          </div>
        </section>

        <form onSubmit={createItem} className="glass rounded-xl p-5 space-y-4">
          <div><h2 className="font-semibold">Create work item</h2><p className="text-sm text-muted-foreground mt-1">Creation and assignment are recorded in activity history.</p></div>
          <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Title" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description" rows={4} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          <div className="grid grid-cols-2 gap-3">
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="rounded-lg border border-border bg-background px-3 py-2 text-sm">{types.map((value) => <option key={value}>{value}</option>)}</select>
            <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="rounded-lg border border-border bg-background px-3 py-2 text-sm">{priorities.map((value) => <option key={value}>{value}</option>)}</select>
          </div>
          <select value={form.teamId} onChange={(e) => setForm({ ...form, teamId: e.target.value, ownerId: '' })} required className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"><option value="">Select team</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select>
          <select value={form.ownerId} onChange={(e) => setForm({ ...form, ownerId: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"><option value="">Unassigned</option>{selectedTeam?.members?.map((member) => <option key={member.userId} value={member.userId}>{member.user.name || member.user.email}</option>)}</select>
          <input type="datetime-local" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          <label className="flex items-center gap-2 text-sm text-muted-foreground"><input type="checkbox" checked={form.requiresApproval} onChange={(e) => setForm({ ...form, requiresApproval: e.target.checked })} /> Requires approval</label>
          <button type="submit" className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-40" disabled={!form.teamId || creating}>{creating ? 'Creating…' : 'Create item'}</button>
        </form>
      </div>
    </div>
  );
}
