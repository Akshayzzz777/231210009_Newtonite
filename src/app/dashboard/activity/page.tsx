'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function ActivityPage() {
  const [data, setData] = useState<{ activities: Array<{ id: string; action: string; details?: string | null; createdAt: string; user: { name?: string | null; email: string }; workItem: { id: string; title: string } }>; pagination: { page: number; pages: number } } | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch(`/api/activity?page=${page}`).then(async (response) => {
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 401) throw new Error('Your session has expired. Sign in again.');
        if (response.status === 403) throw new Error('You do not have access to this activity.');
        throw new Error(result.error || 'Unable to load activity.');
      }
      setData(result);
      setError(null);
    }).catch((reason: Error) => setError(reason.message)).finally(() => setLoading(false));
  }, [page]);
  return <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6"><header><p className="text-sm text-primary font-medium">Audit trail</p><h1 className="text-3xl font-bold">Activity</h1></header>{error && <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}<section className="glass rounded-xl divide-y divide-border">{loading && <p className="p-8 text-center text-sm text-muted-foreground">Loading activity...</p>}{!loading && data?.activities.map((activity) => <article key={activity.id} className="p-5"><p className="text-sm"><strong>{activity.user.name || activity.user.email}</strong> {activity.action.toLowerCase()} <Link className="text-primary hover:underline" href={`/dashboard/work-items/${activity.workItem.id}`}>{activity.workItem.title}</Link></p><p className="text-xs text-muted-foreground mt-1">{new Date(activity.createdAt).toLocaleString()}</p>{activity.action === 'COMMENTED' && <p className="text-sm text-muted-foreground mt-2">{activity.details}</p>}</article>)}{!loading && data?.activities.length === 0 && <p className="p-8 text-center text-muted-foreground">No activity yet.</p>}</section><div className="flex justify-between"><button disabled={page <= 1 || loading} onClick={() => { setLoading(true); setPage(page - 1); }} className="rounded-lg border border-border px-3 py-2 text-sm disabled:opacity-40">Previous</button><span className="text-sm text-muted-foreground self-center">Page {page} of {data?.pagination.pages || 1}</span><button disabled={!data || loading || page >= data.pagination.pages} onClick={() => { setLoading(true); setPage(page + 1); }} className="rounded-lg border border-border px-3 py-2 text-sm disabled:opacity-40">Next</button></div></div>;
}
