import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions, prisma } from '@/lib/auth';
import { accessibleTeamIds, isAdmin } from '@/lib/authorization';

// GET /api/dashboard — aggregate stats for the dashboard
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sessionUser = session.user as { id: string; role?: string };
  const userId = sessionUser.id;
  const memberships = await prisma.teamMember.findMany({
    where: { userId },
    select: { teamId: true, userId: true, role: true },
  });
  const teamIds = accessibleTeamIds({ id: userId, role: sessionUser.role ?? 'MEMBER' }, memberships);
  const admin = isAdmin({ id: userId, role: sessionUser.role ?? 'MEMBER' });
  const scope = admin ? {} : { teamId: { in: teamIds ?? [] } };
  const base = { ...scope, deletedAt: null };
  const itemInclude = {
    team: { select: { id: true, name: true } },
    assignee: { select: { id: true, name: true, email: true, image: true } },
  } as const;

  const [myWork, highPriority, unassigned, blocked, awaitingApproval, recentlyUpdated, totalItems, assignedToMe, createdByMe, statusCounts, recentActivity, teams] = await Promise.all([
    prisma.workItem.findMany({
      where: { ...base, status: { not: 'DONE' }, OR: [{ ownerId: userId }, { assigneeId: userId }] },
      include: itemInclude,
      orderBy: { updatedAt: 'desc' },
      take: 8,
    }),
    prisma.workItem.findMany({
      where: { ...base, status: { not: 'DONE' }, priority: { in: ['HIGH', 'URGENT'] } },
      include: itemInclude,
      orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
      take: 8,
    }),
    prisma.workItem.findMany({
      where: { ...base, status: { not: 'DONE' }, ownerId: null },
      include: itemInclude,
      orderBy: { updatedAt: 'desc' },
      take: 8,
    }),
    prisma.workItem.findMany({
      where: {
        ...base,
        status: { not: 'DONE' },
        approvals: { some: { status: 'REJECTED' } },
      },
      include: {
        ...itemInclude,
        approvals: { select: { status: true }, orderBy: { requestedAt: 'desc' }, take: 1 },
      },
      orderBy: { updatedAt: 'desc' },
      take: 32,
    }).then((items) => items.filter((item) => item.approvals[0]?.status === 'REJECTED').slice(0, 8)),
    prisma.workItem.findMany({
      where: { ...base, status: { not: 'DONE' }, approvals: { some: { status: 'PENDING' } } },
      include: itemInclude,
      orderBy: { updatedAt: 'desc' },
      take: 8,
    }),
    prisma.workItem.findMany({
      where: base,
      include: itemInclude,
      orderBy: { updatedAt: 'desc' },
      take: 8,
    }),
    prisma.workItem.count({ where: base }),
    prisma.workItem.count({ where: { ...base, status: { not: 'DONE' }, assigneeId: userId } }),
    prisma.workItem.count({ where: { ...base, creatorId: userId } }),
    prisma.workItem.groupBy({
      by: ['status'],
      where: base,
      _count: { _all: true },
    }),
    prisma.activityLog.findMany({
      where: { workItem: base },
      include: {
        user: { select: { id: true, name: true, email: true } },
        workItem: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 8,
    }),
    prisma.team.findMany({
      where: admin ? {} : { id: { in: teamIds ?? [] } },
      include: { _count: { select: { members: true, workItems: true } } },
      orderBy: { name: 'asc' },
    }),
  ]);

  const byStatus = Object.fromEntries(statusCounts.map(({ status, _count }) => [status, _count._all]));

  return NextResponse.json({
    stats: { totalItems, assignedToMe, createdByMe, byStatus },
    urgentItems: highPriority,
    recentActivity,
    teams,
    myWork,
    highPriority,
    unassigned,
    blocked,
    awaitingApproval,
    recentlyUpdated,
  });
}
