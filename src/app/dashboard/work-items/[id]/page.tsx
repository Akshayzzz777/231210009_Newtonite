'use client';

import Link from 'next/link';
import { FormEvent, use, useEffect, useState } from 'react';

type Activity = { id: string; action: string; details?: unknown; createdAt: string; user: { name?: string | null; email: string } };
type Comment = { id: string; content: string; createdAt: string; author: { name?: string | null; email: string } };
type Member = { userId: string; role: string; user: { id: string; name?: string | null; email: string } };
type Approval = { id: string; status: string; note?: string | null; reviewer: { id: string; name?: string | null; email: string } };
type Item = {
  id: string;
  title: string;
  description?: string | null;
  type: string;
  status: string;
  priority: string;
  requiresApproval: boolean;
  dueDate?: string | null;
  version: number;
  ownerId?: string | null;
  owner?: { id: string; name?: string | null; email: string } | null;
  creator: { name?: string | null; email: string };
  activities: Activity[];
  comments: Comment[];
  approvals: Approval[];
  team: { name: string; members: Member[] };
};

const statuses = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'];
const priorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
const types = ['TASK', 'BUG', 'FEATURE', 'INCIDENT'];

function formatDetails(details: unknown) {
  if (!details) return null;
  if (typeof details === 'string') return details;
  return JSON.stringify(details);
}

function toDatetimeLocal(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function toIso(value: string) {
  return value ? new Date(value).toISOString() : null;
}

export default function WorkItemDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [item, setItem] = useState<Item | null>(null);
  const [draft, setDraft] = useState({ title: '', description: '', type: 'TASK', dueDate: '', requiresApproval: false });
  const [comment, setComment] = useState('');
  const [reviewerId, setReviewerId] = useState('');
  const [requestNote, setRequestNote] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [permissions, setPermissions] = useState({ canEdit: false, canApprove: false });
  const [loading, setLoading] = useState(true);

  function responseError(status: number, error?: string) {
    if (status === 401) return 'Your session has expired. Sign in again.';
    if (status === 403) return 'You do not have permission to perform this action.';
    if (status === 404) return 'This work item no longer exists.';
    if (status === 409) return error || 'This item changed. Refresh and try again.';
    return error || 'The server could not complete this request.';
  }

  async function load() {
    setLoading(true);
    try {
      const response = await fetch(`/api/work-items/${id}`);
      const data = await response.json();
      if (!response.ok) throw new Error(responseError(response.status, data.error));
      setItem(data.workItem);
      setPermissions(data.permissions ?? { canEdit: false, canApprove: false });
      setReviewerId((current: string) => current || data.workItem.team.members.find((member: Member) => ['APPROVER', 'TEAM_LEAD'].includes(member.role))?.userId || '');
      setDraft({
        title: data.workItem.title,
        description: data.workItem.description || '',
        type: data.workItem.type,
        dueDate: toDatetimeLocal(data.workItem.dueDate),
        requiresApproval: data.workItem.requiresApproval,
      });
      setMessage(null);
    } finally {
      setLoading(false);
    }
  }

  // Load the authoritative server state for the selected work item.
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { load().catch((error: Error) => setMessage(error.message)); }, [id]);

  async function patch(body: Record<string, unknown>) {
    if (!item) return;
    const response = await fetch(`/api/work-items/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, version: item.version }),
    });
    const data = await response.json();
    if (!response.ok) {
      setMessage(responseError(response.status, data.error));
      if (response.status === 409) {
        await load();
      }
      return;
    }
    setMessage(null);
    await load();
  }

  async function saveDetails(event: FormEvent) {
    event.preventDefault();
    await patch({
      title: draft.title,
      description: draft.description,
      type: draft.type,
      dueDate: toIso(draft.dueDate),
      requiresApproval: draft.requiresApproval,
    });
  }

  async function addComment(event: FormEvent) {
    event.preventDefault();
    if (!comment.trim()) return;
    const response = await fetch(`/api/work-items/${id}/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: comment }) });
    const data = await response.json();
    if (!response.ok) { setMessage(responseError(response.status, data.error)); return; }
    setComment('');
    await load();
  }

  async function requestApproval(event: FormEvent) {
    event.preventDefault();
    if (!reviewerId) return;
    const response = await fetch(`/api/work-items/${id}/approvals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reviewerId, note: requestNote || undefined }),
    });
    const data = await response.json();
    if (!response.ok) { setMessage(responseError(response.status, data.error)); return; }
    setRequestNote('');
    setMessage(null);
    await load();
  }

  async function decideApproval(approvalId: string, status: 'APPROVED' | 'REJECTED') {
    if (status === 'REJECTED' && !rejectionReason.trim()) {
      setMessage('Enter a reason before rejecting this approval.');
      return;
    }
    const response = await fetch(`/api/work-items/${id}/approvals`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approvalId, status, note: status === 'REJECTED' ? rejectionReason.trim() : undefined }),
    });
    const data = await response.json();
    if (!response.ok) { setMessage(responseError(response.status, data.error)); return; }
    setRejectionReason('');
    setMessage(null);
    await load();
  }

  if (loading && !item) return <div className="p-8 text-muted-foreground">Loading work item...</div>;
  if (!item) return <div role="alert" className="p-8 text-destructive">{message || 'Unable to load work item.'}</div>;

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-6">
      <Link href="/dashboard/work-items" className="text-sm text-primary hover:underline">Back to work items</Link>
      {message && <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{message}</div>}

      <header className="space-y-2">
        <p className="text-sm text-muted-foreground">{item.team.name} · {item.type}</p>
        <h1 className="text-3xl font-bold">{item.title}</h1>
        <p className="text-sm text-muted-foreground">Created by {item.creator.name || item.creator.email} · Version {item.version}</p>
      </header>

      <div className="grid lg:grid-cols-[1fr_340px] gap-6 items-start">
        <main className="space-y-6">
          <form onSubmit={saveDetails} className="glass rounded-xl p-5 space-y-4">
            <h2 className="font-semibold">Details</h2>
            <input required maxLength={500} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} disabled={!permissions.canEdit} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:opacity-60" />
            <textarea maxLength={5000} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} rows={5} disabled={!permissions.canEdit} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:opacity-60" />
            <div className="grid md:grid-cols-2 gap-3">
              <select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })} disabled={!permissions.canEdit} className="rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:opacity-60">{types.map((value) => <option key={value}>{value}</option>)}</select>
              <input type="datetime-local" value={draft.dueDate} onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })} disabled={!permissions.canEdit} className="rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:opacity-60" />
            </div>
            <label className="flex items-center gap-2 text-sm text-muted-foreground"><input type="checkbox" checked={draft.requiresApproval} onChange={(e) => setDraft({ ...draft, requiresApproval: e.target.checked })} disabled={!permissions.canEdit} /> Requires approval before done</label>
            {permissions.canEdit && <button className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground">Save details</button>}
          </form>

          <section className="glass rounded-xl p-5 space-y-4">
            <h2 className="font-semibold">Comments <span className="text-muted-foreground font-normal">({item.comments.length})</span></h2>
            {item.comments.length === 0 ? <p className="text-sm text-muted-foreground">No comments yet.</p> : <div className="space-y-3">{item.comments.map((entry) => <article key={entry.id} className="border-b border-border/60 pb-3 last:border-0"><p className="text-sm whitespace-pre-wrap">{entry.content}</p><p className="mt-1 text-xs text-muted-foreground">{entry.author.name || entry.author.email} · {new Date(entry.createdAt).toLocaleString()}</p></article>)}</div>}
            <form onSubmit={addComment} className="flex gap-2">
              <input required maxLength={5000} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a comment" className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              <button className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground">Comment</button>
            </form>
          </section>

          <section className="glass rounded-xl p-5 space-y-4">
            <h2 className="font-semibold">Activity history</h2>
            {item.activities.length === 0 ? <p className="text-sm text-muted-foreground">No activity recorded yet.</p> : <div className="space-y-4">{item.activities.map((activity) => <article key={activity.id} className="border-l-2 border-primary/40 pl-4"><p className="text-sm"><strong>{activity.user.name || activity.user.email}</strong> {activity.action.toLowerCase().replaceAll('_', ' ')}</p><p className="text-xs text-muted-foreground">{new Date(activity.createdAt).toLocaleString()}</p>{formatDetails(activity.details) && <p className="mt-1 text-xs text-muted-foreground whitespace-pre-wrap break-all">{formatDetails(activity.details)}</p>}</article>)}</div>}
          </section>
        </main>

        <aside className="glass rounded-xl p-5 space-y-5">
          <div>
            <h2 className="font-semibold">Workflow</h2>
            <p className="text-sm text-muted-foreground mt-1">Status changes are validated on the server.</p>
          </div>
          <label className="block text-sm text-muted-foreground">Status<select value={item.status} onChange={(e) => patch({ status: e.target.value })} className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground">{statuses.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label className="block text-sm text-muted-foreground">Priority<select value={item.priority} onChange={(e) => patch({ priority: e.target.value })} className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground">{priorities.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label className="block text-sm text-muted-foreground">Owner<select value={item.ownerId || ''} onChange={(e) => patch({ ownerId: e.target.value || null })} className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground"><option value="">Unassigned</option>{item.team.members.map((member) => <option key={member.userId} value={member.userId}>{member.user.name || member.user.email}</option>)}</select></label>
          <button onClick={() => patch({ claim: true })} className="w-full rounded-lg border border-border px-4 py-2 text-sm">Claim work item</button>

          <div className="border-t border-border pt-5 space-y-2">
            <h3 className="font-medium">Approvals</h3>
            {permissions.canEdit && item.requiresApproval && item.status !== 'DONE' && !item.approvals.some((approval) => approval.status === 'PENDING') && <form onSubmit={requestApproval} className="space-y-2"><select required value={reviewerId} onChange={(e) => setReviewerId(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"><option value="">Select reviewer</option>{item.team.members.filter((member) => ['APPROVER', 'TEAM_LEAD'].includes(member.role)).map((member) => <option key={member.userId} value={member.userId}>{member.user.name || member.user.email} · {member.role.replace('_', ' ')}</option>)}</select><input value={requestNote} onChange={(e) => setRequestNote(e.target.value)} maxLength={1000} placeholder="Request note (optional)" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /><button disabled={!reviewerId} className="w-full rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50">Request approval</button></form>}
            {item.approvals.length === 0 && <p className="text-sm text-muted-foreground">No approvals requested.</p>}
            {item.approvals.map((approval) => <div key={approval.id} className="rounded-lg bg-muted/40 p-3 text-sm"><p>{approval.reviewer.name || approval.reviewer.email}</p><p className="text-xs text-muted-foreground">{approval.status}</p>{approval.note && <p className="text-xs text-muted-foreground mt-1">{approval.note}</p>}{permissions.canApprove && approval.status === 'PENDING' && <div className="mt-3 space-y-2"><input value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} maxLength={1000} placeholder="Reason required to reject" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /><div className="flex gap-2"><button type="button" onClick={() => decideApproval(approval.id, 'APPROVED')} className="flex-1 rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">Approve</button><button type="button" onClick={() => decideApproval(approval.id, 'REJECTED')} className="flex-1 rounded-lg border border-border px-3 py-2 text-sm">Reject</button></div></div>}</div>)}
          </div>
        </aside>
      </div>
    </div>
  );
}
