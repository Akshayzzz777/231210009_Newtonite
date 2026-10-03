import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions, prisma } from '@/lib/auth';
import { z } from 'zod';

const CreateTeamSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().max(500).optional(),
});

// GET /api/teams — list teams user belongs to
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = (session.user as { id: string }).id;

  const memberships = await prisma.teamMember.findMany({
    where: { userId },
    include: {
      team: {
        include: {
          members: {
            include: { user: { select: { id: true, name: true, email: true, image: true } } },
          },
          _count: { select: { workItems: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const teams = memberships.map((m) => ({
    ...m.team,
    myRole: m.role,
  }));

  return NextResponse.json({ teams });
}

// POST /api/teams — create a new team
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = (session.user as { id: string }).id;

  try {
    const body = await request.json();
    const parsed = CreateTeamSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const { name, description } = parsed.data;

    const team = await prisma.$transaction(async (tx) => {
      const newTeam = await tx.team.create({
        data: { name, description },
      });

      await tx.teamMember.create({
        data: {
          userId,
          teamId: newTeam.id,
          role: 'TEAM_LEAD',
        },
      });

      return newTeam;
    });

    return NextResponse.json({ team }, { status: 201 });
  } catch (error) {
    console.error('Create team error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
