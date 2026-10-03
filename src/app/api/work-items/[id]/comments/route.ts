import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions, prisma } from '@/lib/auth';
import { z } from 'zod';
import { canViewWork } from '@/lib/authorization';

const CommentSchema = z.object({
  content: z.string().min(1).max(5000),
});

// POST /api/work-items/[id]/comments — add a comment
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sessionUser = session.user as { id: string; role?: string };
  const userId = sessionUser.id;
  const { id: workItemId } = await params;

  try {
    const body = await request.json();
    const parsed = CommentSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 });
    }

    const { content } = parsed.data;

    // Verify work item exists and user is a team member
    const workItem = await prisma.workItem.findUnique({
      where: { id: workItemId, deletedAt: null },
      include: { team: { select: { members: { select: { userId: true, teamId: true, role: true } } } } },
    });

    if (!workItem) {
      return NextResponse.json({ error: 'Work item not found' }, { status: 404 });
    }

    if (!canViewWork({
      user: { id: userId, role: sessionUser.role ?? 'MEMBER' },
      workItem,
      memberships: workItem.team.members,
    })) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const comment = await tx.comment.create({
        data: {
          workItemId,
          authorId: userId,
          content,
        },
        include: { author: { select: { id: true, name: true, email: true, image: true } } },
      });

      const activity = await tx.activityLog.create({
        data: {
          workItemId,
          userId,
          action: 'COMMENTED',
          details: content,
        },
        include: {
          user: { select: { id: true, name: true, email: true, image: true } },
        },
      });

      return { comment, activity };
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Comment error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
