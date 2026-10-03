import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions, prisma } from '@/lib/auth';
import { z } from 'zod';
import { isAdmin } from '@/lib/authorization';

// Helper to check if user is a member of a team
async function requireTeamMember(userId: string, teamId: string) {
  const member = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId, teamId } },
  });
  return member;
}

// Helper to check if user can manage a team
async function requireTeamLead(userId: string, userRole: string | undefined, teamId: string) {
  if (userRole === 'ADMIN') {
    return { userId, teamId, role: 'TEAM_LEAD' };
  }

  const member = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId, teamId } },
  });
  return member?.role === 'TEAM_LEAD' ? member : null;
}

const InviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(['MEMBER', 'TEAM_LEAD', 'APPROVER']).default('MEMBER'),
});

// POST /api/teams/[teamId]/members — invite a member
export async function POST(
  request: Request,
  { params }: { params: Promise<{ teamId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sessionUser = session.user as { id: string; role?: string };
  const userId = sessionUser.id;
  const { teamId } = await params;

  const teamLead = await requireTeamLead(userId, sessionUser.role, teamId);
  if (!teamLead) {
    return NextResponse.json(
      { error: 'Forbidden - only team leads or admins can invite members' },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const parsed = InviteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 });
    }

    const { email, role } = parsed.data;

    const invitee = await prisma.user.findUnique({ where: { email } });
    if (!invitee) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Check if already a member
    const existing = await prisma.teamMember.findUnique({
      where: { userId_teamId: { userId: invitee.id, teamId } },
    });
    if (existing) {
      return NextResponse.json({ error: 'User is already a team member' }, { status: 409 });
    }

    const membership = await prisma.teamMember.create({
      data: { userId: invitee.id, teamId, role },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    return NextResponse.json({ membership }, { status: 201 });
  } catch (error) {
    console.error('Invite member error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET /api/teams/[teamId]/members — list team members
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ teamId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sessionUser = session.user as { id: string; role?: string };
  const userId = sessionUser.id;
  const { teamId } = await params;

  const member = await requireTeamMember(userId, teamId);
  if (!member && !isAdmin({ id: userId, role: sessionUser.role ?? 'MEMBER' })) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const members = await prisma.teamMember.findMany({
    where: { teamId },
    include: { user: { select: { id: true, name: true, email: true, image: true, createdAt: true } } },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json({ members });
}
