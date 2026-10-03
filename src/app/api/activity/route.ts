import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions, prisma } from '@/lib/auth';

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as { id: string }).id;
  const params = new URL(request.url).searchParams;
  const page = Math.max(1, Number(params.get('page') || 1));
  const limit = Math.min(50, Math.max(1, Number(params.get('limit') || 25)));
  const memberships = await prisma.teamMember.findMany({ where: { userId }, select: { teamId: true } });
  const teamIds = memberships.map((membership) => membership.teamId);
  const where = { workItem: { teamId: { in: teamIds }, deletedAt: null } };
  const [activities, total] = await Promise.all([
    prisma.activityLog.findMany({ where, include: { user: { select: { id: true, name: true, email: true } }, workItem: { select: { id: true, title: true } } }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
    prisma.activityLog.count({ where }),
  ]);
  return NextResponse.json({ activities, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
}
