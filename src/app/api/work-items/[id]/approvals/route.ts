import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions, prisma } from '@/lib/auth';
import { canApproveWork, canEditWork, canViewWork } from '@/lib/authorization';

const CreateApprovalSchema = z.object({
  reviewerId: z.string().uuid(),
  note: z.string().max(1000).optional(),
});

const UpdateApprovalSchema = z.object({
  approvalId: z.string().uuid(),
  status: z.enum(['APPROVED', 'REJECTED']),
  note: z.string().trim().max(1000).optional(),
}).refine((value) => value.status !== 'REJECTED' || Boolean(value.note), {
  message: 'A rejection reason is required',
  path: ['note'],
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sessionUser = session.user as { id: string; role?: string };
  const { id } = await params;

  const workItem = await prisma.workItem.findUnique({
    where: { id, deletedAt: null },
    include: {
      team: { select: { members: { select: { userId: true, teamId: true, role: true } } } },
      approvals: {
        include: {
          requester: { select: { id: true, name: true, email: true } },
          reviewer: { select: { id: true, name: true, email: true } },
        },
        orderBy: { requestedAt: 'desc' },
      },
    },
  });

  if (!workItem) {
    return NextResponse.json({ error: 'Work item not found' }, { status: 404 });
  }

  if (!canViewWork({
    user: { id: sessionUser.id, role: sessionUser.role ?? 'MEMBER' },
    workItem,
    memberships: workItem.team.members,
  })) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json({ approvals: workItem.approvals });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sessionUser = session.user as { id: string; role?: string };
  const { id } = await params;

  try {
    const body = await request.json();
    const parsed = CreateApprovalSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 });
    }

    const workItem = await prisma.workItem.findUnique({
      where: { id, deletedAt: null },
      include: {
        team: { select: { members: { select: { userId: true, teamId: true, role: true } } } },
      },
    });

    if (!workItem) {
      return NextResponse.json({ error: 'Work item not found' }, { status: 404 });
    }

    const authContext = {
      user: { id: sessionUser.id, role: sessionUser.role ?? 'MEMBER' },
      workItem,
      memberships: workItem.team.members,
    };

    if (!canEditWork(authContext)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!workItem.requiresApproval || workItem.status === 'DONE') {
      return NextResponse.json({ error: 'This work item is not awaiting approval' }, { status: 409 });
    }

    const reviewerMembership = workItem.team.members.find((member) => member.userId === parsed.data.reviewerId);
    if (!reviewerMembership || !['APPROVER', 'TEAM_LEAD'].includes(reviewerMembership.role)) {
      return NextResponse.json({ error: 'Reviewer must be an approver or team lead in this team' }, { status: 400 });
    }

    const approval = await prisma.$transaction(async (tx) => {
      const pending = await tx.approval.findFirst({
        where: { workItemId: id, status: 'PENDING' },
        select: { id: true },
      });
      if (pending) throw new Error('APPROVAL_CONFLICT');

      const created = await tx.approval.create({
        data: {
          workItemId: id,
          requesterId: sessionUser.id,
          reviewerId: parsed.data.reviewerId,
          note: parsed.data.note,
        },
      });

      await tx.workItem.update({
        where: { id, version: workItem.version },
        data: { version: { increment: 1 } },
      });
      await tx.activityLog.create({
        data: {
          workItemId: id,
          userId: sessionUser.id,
          action: 'APPROVAL_REQUESTED',
          details: { approvalId: created.id, reviewerId: parsed.data.reviewerId },
        },
      });

      return created;
    });

    return NextResponse.json({ approval }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === 'APPROVAL_CONFLICT') {
      return NextResponse.json({ error: 'An approval is already pending', code: 'APPROVAL_CONFLICT' }, { status: 409 });
    }
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
      return NextResponse.json({ error: 'An approval is already pending', code: 'APPROVAL_CONFLICT' }, { status: 409 });
    }
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2025') {
      return NextResponse.json({ error: 'Work item changed; refresh and try again', code: 'VERSION_CONFLICT' }, { status: 409 });
    }
    console.error('Create approval error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sessionUser = session.user as { id: string; role?: string };
  const { id } = await params;

  try {
    const body = await request.json();
    const parsed = UpdateApprovalSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 });
    }

    const approval = await prisma.approval.findUnique({
      where: { id: parsed.data.approvalId },
      include: {
        workItem: {
          include: {
            team: { select: { members: { select: { userId: true, teamId: true, role: true } } } },
          },
        },
      },
    });

    if (!approval || approval.workItemId !== id || approval.workItem.deletedAt) {
      return NextResponse.json({ error: 'Approval not found' }, { status: 404 });
    }

    const authContext = {
      user: { id: sessionUser.id, role: sessionUser.role ?? 'MEMBER' },
      workItem: approval.workItem,
      memberships: approval.workItem.team.members,
    };

    if (!canApproveWork(authContext, approval)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (approval.status !== 'PENDING') {
      return NextResponse.json({ error: 'This approval has already been decided', code: 'APPROVAL_CONFLICT' }, { status: 409 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const changed = await tx.approval.updateMany({
        where: { id: approval.id, workItemId: id, status: 'PENDING' },
        data: {
          status: parsed.data.status,
          note: parsed.data.note ?? approval.note,
          decidedAt: new Date(),
        },
      });
      if (changed.count !== 1) throw new Error('APPROVAL_CONFLICT');

      await tx.workItem.update({ where: { id }, data: { version: { increment: 1 } } });
      await tx.activityLog.create({
        data: {
          workItemId: id,
          userId: sessionUser.id,
          action: parsed.data.status,
          details: {
            approvalId: approval.id,
            ...(parsed.data.status === 'REJECTED' ? { reason: parsed.data.note } : {}),
          },
        },
      });

      return tx.approval.findUnique({
        where: { id: approval.id },
        include: {
          requester: { select: { id: true, name: true, email: true } },
          reviewer: { select: { id: true, name: true, email: true } },
        },
      });
    });

    return NextResponse.json({ approval: updated });
  } catch (error) {
    if (error instanceof Error && error.message === 'APPROVAL_CONFLICT') {
      return NextResponse.json({ error: 'This approval has already been decided', code: 'APPROVAL_CONFLICT' }, { status: 409 });
    }
    console.error('Update approval error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
