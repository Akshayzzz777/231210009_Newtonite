'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';

interface WorkItem {
  id: string;
  title: string;
  status: string;
  priority: string;
  assignee?: { id: string; name?: string; email: string; image?: string } | null;
  team: { id: string; name: string };
}

interface Activity {
  id: string;
  action: string;
  details?: string | null;
  createdAt: string;
  user: { id: string; name?: string; email: string };
  workItem: { id: string; title: string };
}

function priorityBadge(p: string) {
  const map: Record<string, string> = {
    LOW: 'priority-low',
    MEDIUM: 'priority-medium',
    HIGH: 'priority-high',
    URGENT: 'priority-urgent',
  };
  return map[p] ?? 'priority-medium';
}

function statusBadge(s: string) {
  const map: Record<string, string> = {
    TODO: 'status-todo',
    IN_PROGRESS: 'status-in-progress',
    IN_REVIEW: 'status-in-review',
    DONE: 'status-done',
  };
  return map[s] ?? 'status-todo';
}

function formatAction(action: string) {
  const map: Record<string, string> = {
    CREATED: 'created',
    UPDATED: 'updated',
    COMMENTED: 'commented on',
    DELETED: 'deleted',
  };
  return map[action] ?? action.toLowerCase();
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function DashboardPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => fetch('/api/dashboard').then((r) => r.json()),
  });

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-muted rounded-xl w-48" />
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => <div key={i} className="h-28 bg-muted rounded-2xl" />)}
          </div>
        </div>
      </div>
    );
  }

  if (error || data?.error) {
    return (
      <div className="p-8">
        <div className="rounded-2xl bg-destructive/15 border border-destructive/30 p-6 text-destructive">
          Failed to load dashboard data
        </div>
      </div>
    );
  }

  const { stats, urgentItems, recentActivity, teams } = data;

  const statusOrder = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'];
  const statusLabels: Record<string, string> = {
    TODO: 'To Do',
    IN_PROGRESS: 'In Progress',
    IN_REVIEW: 'In Review',
    DONE: 'Done',
  };

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Your work at a glance</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title="Total Work Items"
          value={stats.totalItems}
          description="Across all your teams"
          colour="oklch(0.65 0.22 264)"
        />
        <StatCard
          title="Assigned to Me"
          value={stats.assignedToMe}
          description="Open items requiring attention"
          colour="oklch(0.65 0.22 30)"
        />
        <StatCard
          title="Created by Me"
          value={stats.createdByMe}
          description="Items you've created"
          colour="oklch(0.65 0.22 150)"
        />
      </div>

      {/* Status breakdown */}
      <div className="glass rounded-2xl p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">Status Breakdown</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {statusOrder.map((s) => (
            <div key={s} className="text-center">
              <div className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium mb-2 ${statusBadge(s)}`}>
                {statusLabels[s]}
              </div>
              <p className="text-3xl font-bold text-foreground">{stats.byStatus[s] ?? 0}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Urgent items */}
        <div className="glass rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">Needs Attention</h2>
            <Link href="/dashboard/work-items?priority=URGENT&priority=HIGH" className="text-sm text-primary hover:underline">
              View all →
            </Link>
          </div>
          {urgentItems.length === 0 ? (
            <p className="text-muted-foreground text-sm">No urgent items — great job! 🎉</p>
          ) : (
            <ul className="space-y-3">
              {urgentItems.map((item: WorkItem) => (
                <li key={item.id}>
                  <Link href={`/dashboard/work-items/${item.id}`}
                    className="flex items-start gap-3 p-3 rounded-xl hover:bg-muted/50 transition-colors group">
                    <span className={`mt-0.5 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${priorityBadge(item.priority)}`}>
                      {item.priority}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
                        {item.title}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">{item.team.name}</p>
                    </div>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${statusBadge(item.status)}`}>
                      {statusLabels[item.status]}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Recent Activity */}
        <div className="glass rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">Recent Activity</h2>
            <Link href="/dashboard/activity" className="text-sm text-primary hover:underline">
              View all →
            </Link>
          </div>
          {recentActivity.length === 0 ? (
            <p className="text-muted-foreground text-sm">No activity yet</p>
          ) : (
            <ul className="space-y-3">
              {recentActivity.slice(0, 8).map((act: Activity) => (
                <li key={act.id} className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 mt-0.5"
                    style={{ background: 'linear-gradient(135deg, oklch(0.55 0.22 264), oklch(0.55 0.22 300))' }}>
                    {(act.user.name || act.user.email).slice(0, 1).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground">
                      <span className="font-medium">{act.user.name || act.user.email}</span>{' '}
                      {formatAction(act.action)}{' '}
                      <Link href={`/dashboard/work-items/${act.workItem.id}`}
                        className="text-primary hover:underline font-medium">
                        {act.workItem.title}
                      </Link>
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">{timeAgo(act.createdAt)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Teams */}
      {teams?.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">Your Teams</h2>
            <Link href="/dashboard/teams" className="text-sm text-primary hover:underline">Manage teams →</Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {teams.map((team: { id: string; name: string; _count: { members: number; workItems: number } }) => (
              <Link key={team.id} href={`/dashboard/teams/${team.id}`}
                className="glass rounded-2xl p-5 hover:border-primary/30 transition-all duration-200 group block">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold text-white"
                    style={{ background: 'linear-gradient(135deg, oklch(0.55 0.22 264), oklch(0.55 0.22 300))' }}>
                    {team.name.slice(0, 1).toUpperCase()}
                  </div>
                  <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">{team.name}</h3>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>{team._count.members} member{team._count.members !== 1 ? 's' : ''}</span>
                  <span>{team._count.workItems} item{team._count.workItems !== 1 ? 's' : ''}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  title,
  value,
  description,
  colour,
}: {
  title: string;
  value: number;
  description: string;
  colour: string;
}) {
  return (
    <div className="glass rounded-2xl p-6 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-32 h-32 rounded-full opacity-10 -translate-y-8 translate-x-8"
        style={{ background: `radial-gradient(circle, ${colour}, transparent)` }} />
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      <p className="text-4xl font-bold text-foreground mt-2" style={{ color: colour }}>{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{description}</p>
    </div>
  );
}
