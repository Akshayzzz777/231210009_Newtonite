import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { authOptions, prisma } from '../../../../lib/auth';
import { canApproveWork, canAssignWork, canChangePriorityStatus, canEditWork, canViewWork, hasTeamRole, isAdmin } from '../../../../lib/authorization';
import { validateWorkItemStatusTransition } from '../../../../lib/workflow';

const UpdateWorkItemSchema = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  description: z.string().max(5000).optional().nullable(),
  type: z.enum(['TASK', 'BUG', 'FEATURE', 'INCIDENT']).optional(),
  status: z.enum(['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  ownerId: z.string().uuid().optional().nullable(),
  dueDate: z.string().datetime().optional().nullable(),
  requiresApproval: z.boolean().optional(),
  claim: z.boolean().optional(),
  version: z.number().int(),
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
      creator: { select: { id: true, name: true, email: true, image: true } },
      owner: { select: { id: true, name: true, email: true, image: true } },
      assignee: { select: { id: true, name: true, email: true, image: true } },
      team: {
        include: {
          members: {
            select: {
              userId: true,
              teamId: true,
              role: true,
              user: { select: { id: true, name: true, email: true, image: true } },
            },
          },
        },
      },
      approvals: {
        include: {
          requester: { select: { id: true, name: true, email: true } },
          reviewer: { select: { id: true, name: true, email: true } },
        },
        orderBy: { requestedAt: 'desc' },
      },
      comments: {
        include: { author: { select: { id: true, name: true, email: true, image: true } } },
        orderBy: { createdAt: 'asc' },
        take: 100,
      },
      activities: {
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      },
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

  if (!canViewWork(authContext)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json({
    workItem,
    permissions: {
      canEdit: canEditWork(authContext),
      canApprove: canApproveWork(authContext),
    },
  });
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
  const userId = sessionUser.id;
  const { id } = await params;

  try {
    const body = await request.json();
    const parsed = UpdateWorkItemSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 });
    }

    const { version, claim, ...updates } = parsed.data;

    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.workItem.findUnique({
        where: { id, deletedAt: null },
        include: {
          team: { select: { id: true, members: { select: { userId: true, teamId: true, role: true } } } },
          approvals: { select: { status: true }, orderBy: { requestedAt: 'desc' }, take: 1 },
        },
      });

      if (!current) {
        throw new Error('NOT_FOUND');
      }

      const authContext = {
        user: { id: userId, role: sessionUser.role ?? 'MEMBER' },
        workItem: current,
        memberships: current.team.members,
      };

      if (!canViewWork(authContext)) {
        throw new Error('FORBIDDEN');
      }
      if (current.version !== version) {
        throw new Error('VERSION_CONFLICT');
      }

      const nextOwnerId = claim ? userId : updates.ownerId;
      if (nextOwnerId !== undefined && nextOwnerId !== null) {
        const ownerMember = current.team.members.find((member) => member.userId === nextOwnerId);
        if (!ownerMember) {
          throw new Error('INVALID_OWNER');
        }
      }

      if (claim && current.ownerId) {
        throw new Error('CLAIM_CONFLICT');
      }

      if (updates.ownerId !== undefined && !canAssignWork(authContext)) {
        throw new Error('FORBIDDEN');
      }

      const editsContent =
        updates.title !== undefined ||
        updates.description !== undefined ||
        updates.type !== undefined ||
        updates.dueDate !== undefined ||
        updates.requiresApproval !== undefined;
      if (editsContent && !canEditWork(authContext)) {
        throw new Error('FORBIDDEN');
      }

      if (
        (updates.status !== undefined || updates.priority !== undefined) &&
        !canChangePriorityStatus(authContext, { status: updates.status, priority: updates.priority })
      ) {
        throw new Error('FORBIDDEN');
      }

      const hasLatestApprovedApproval = current.approvals[0]?.status === 'APPROVED';
      if (updates.status !== undefined) {
        const transition = validateWorkItemStatusTransition({
          from: current.status,
          to: updates.status,
          requiresApproval: updates.requiresApproval ?? current.requiresApproval,
          hasApprovedApproval: hasLatestApprovedApproval,
        });
        if (!transition.ok) {
          throw new Error(transition.reason);
        }
      } else if (updates.requiresApproval === true && current.status === 'DONE' && !hasLatestApprovedApproval) {
        throw new Error('This work item requires approval before it can be marked done');
      }

      const data: Prisma.WorkItemUpdateInput = { version: { increment: 1 } };
      const activities: Array<{ action: string; details: Prisma.InputJsonValue }> = [];

      function recordChange(action: string, field: string, from: unknown, to: unknown) {
        if (from !== to) {
          activities.push({ action, details: { [field]: { from, to } } as Prisma.InputJsonValue });
        }
      }

      if (updates.title !== undefined) {
        recordChange('UPDATED_TITLE', 'title', current.title, updates.title);
        data.title = updates.title;
      }
      if (updates.description !== undefined) {
        recordChange('UPDATED_DESCRIPTION', 'description', current.description, updates.description);
        data.description = updates.description;
      }
      if (updates.type !== undefined) {
        recordChange('UPDATED_TYPE', 'type', current.type, updates.type);
        data.type = updates.type;
      }
      if (updates.priority !== undefined) {
        recordChange('PRIORITY_CHANGED', 'priority', current.priority, updates.priority);
        data.priority = updates.priority;
      }
      if (updates.status !== undefined) {
        recordChange('STATUS_CHANGED', 'status', current.status, updates.status);
        data.status = updates.status;
      }
      if (updates.dueDate !== undefined) {
        const nextDueDate = updates.dueDate ? new Date(updates.dueDate) : null;
        recordChange('DUE_DATE_CHANGED', 'dueDate', current.dueDate?.toISOString() ?? null, nextDueDate?.toISOString() ?? null);
        data.dueDate = nextDueDate;
      }
      if (updates.requiresApproval !== undefined) {
        recordChange('APPROVAL_REQUIREMENT_CHANGED', 'requiresApproval', current.requiresApproval, updates.requiresApproval);
        data.requiresApproval = updates.requiresApproval;
      }
      if (nextOwnerId !== undefined) {
        recordChange(claim ? 'CLAIMED' : 'ASSIGNED', 'ownerId', current.ownerId, nextOwnerId);
        data.owner = nextOwnerId ? { connect: { id: nextOwnerId } } : { disconnect: true };
        data.assignee = nextOwnerId ? { connect: { id: nextOwnerId } } : { disconnect: true };
      }

      const updated = await tx.workItem.update({
        where: claim ? { id, version, ownerId: null } : { id, version },
        data,
        include: {
          creator: { select: { id: true, name: true, email: true, image: true } },
          owner: { select: { id: true, name: true, email: true, image: true } },
          team: { select: { id: true, name: true } },
        },
      });

      for (const activity of activities) {
        await tx.activityLog.create({
          data: {
            workItemId: id,
            userId,
            action: activity.action,
            details: activity.details,
          },
        });
      }

      return updated;
    });

    return NextResponse.json({ workItem: result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'NOT_FOUND') return NextResponse.json({ error: 'Work item not found' }, { status: 404 });
    if (message === 'FORBIDDEN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (message === 'VERSION_CONFLICT') {
      return NextResponse.json({ error: 'Version conflict - refresh and try again', code: 'VERSION_CONFLICT' }, { status: 409 });
    }
    if (message === 'CLAIM_CONFLICT') {
      return NextResponse.json({ error: 'Claim conflict - this work item has already been claimed', code: 'CLAIM_CONFLICT' }, { status: 409 });
    }
    if (message === 'INVALID_OWNER') return NextResponse.json({ error: 'Owner is not a member of this team' }, { status: 400 });
    if (message === 'Invalid workflow transition' || message.startsWith('This work item requires approval')) {
      return NextResponse.json({ error: message }, { status: 422 });
    }
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2025') {
      return NextResponse.json({ error: 'Version conflict - refresh and try again', code: 'VERSION_CONFLICT' }, { status: 409 });
    }

    console.error('Update work item error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = session.user as { id: string; role?: string };
  const { id } = await params;

  const workItem = await prisma.workItem.findUnique({
    where: { id, deletedAt: null },
    include: {
      team: { select: { members: { select: { userId: true, teamId: true, role: true } } } },
    },
  });

  if (!workItem) {
    return NextResponse.json({ error: 'Work item not found' }, { status: 404 });
  }

  const memberships = workItem.team.members;
  const authUser = { id: user.id, role: user.role ?? 'MEMBER' };
  if (!canViewWork({ user: authUser, workItem, memberships })) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const isCreator = workItem.creatorId === user.id;
  const isTeamLead = hasTeamRole(authUser, memberships, workItem.teamId, ['TEAM_LEAD']);
  const userIsAdmin = isAdmin(authUser);

  if (!isCreator && !isTeamLead && !userIsAdmin) {
    return NextResponse.json(
      { error: 'Forbidden - only the creator, team lead, or admin can delete this work item' },
      { status: 403 }
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.activityLog.create({
      data: {
        workItemId: id,
        userId: user.id,
        action: 'DELETED',
        details: { title: workItem.title },
      },
    });
    await tx.workItem.update({
      where: { id },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    });
  });

  return NextResponse.json({ message: 'Work item deleted' });
}
