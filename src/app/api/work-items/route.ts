import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { authOptions, prisma } from '@/lib/auth';
import { accessibleTeamIds, canAssignWork, canChangePriorityStatus, isAdmin } from '@/lib/authorization';

const WorkItemTypeSchema = z.enum(['TASK', 'BUG', 'FEATURE', 'INCIDENT']);
const WorkItemStatusSchema = z.enum(['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE']);
const WorkItemPrioritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);
const IdempotencyKeySchema = z.string().uuid();

const CreatedWorkItemInclude = {
  creator: { select: { id: true, name: true, email: true } },
  owner: { select: { id: true, name: true, email: true } },
  team: { select: { id: true, name: true } },
} satisfies Prisma.WorkItemInclude;

type CreatedWorkItem = Prisma.WorkItemGetPayload<{ include: typeof CreatedWorkItemInclude }>;

function publicWorkItem(item: CreatedWorkItem) {
  return { ...item, idempotencyKey: undefined, idempotencyHash: undefined };
}

function replayWorkItem(item: CreatedWorkItem, userId: string, requestHash: string) {
  if (item.creatorId !== userId || item.idempotencyHash !== requestHash) {
    return NextResponse.json({ error: 'Idempotency key was already used for a different request' }, { status: 409 });
  }

  return NextResponse.json({ workItem: publicWorkItem(item) }, { status: 200 });
}

const CreateWorkItemSchema = z.object({
  title: z.string().trim().min(1).max(500),
  description: z.string().max(5000).optional().nullable(),
  type: WorkItemTypeSchema.default('TASK'),
  status: WorkItemStatusSchema.default('TODO'),
  priority: WorkItemPrioritySchema.default('MEDIUM'),
  teamId: z.string().uuid(),
  ownerId: z.string().uuid().optional().nullable(),
  dueDate: z.string().datetime().optional().nullable(),
  requiresApproval: z.boolean().default(false),
}).refine((value) => !value.requiresApproval || value.status !== 'DONE', {
  message: 'Approval-required work cannot be created as done',
  path: ['status'],
});

const WorkItemQuerySchema = z.object({
  teamId: z.string().uuid().optional(),
  status: WorkItemStatusSchema.optional(),
  priority: WorkItemPrioritySchema.optional(),
  type: WorkItemTypeSchema.optional(),
  ownerId: z.union([z.string().uuid(), z.literal('unassigned')]).optional(),
  search: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['updatedAt', 'createdAt', 'title', 'priority', 'dueDate']).default('updatedAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sessionUser = session.user as { id: string; role?: string };
  const userId = sessionUser.id;
  const { searchParams } = new URL(request.url);

  const query = WorkItemQuerySchema.safeParse(Object.fromEntries(searchParams));
  if (!query.success) {
    return NextResponse.json({ error: 'Invalid query params', issues: query.error.issues }, { status: 400 });
  }

  const { teamId, status, priority, type, ownerId, search, page, limit, sortBy, sortOrder } = query.data;

  const memberships = await prisma.teamMember.findMany({
    where: { userId },
    select: { userId: true, teamId: true, role: true },
  });
  const userTeamIds = accessibleTeamIds({ id: userId, role: sessionUser.role ?? 'MEMBER' }, memberships);

  if (teamId && userTeamIds && !userTeamIds.includes(teamId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const where: Prisma.WorkItemWhereInput = {
    ...(teamId ? { teamId } : userTeamIds ? { teamId: { in: userTeamIds } } : {}),
    deletedAt: null,
    ...(status && { status }),
    ...(priority && { priority }),
    ...(type && { type }),
    ...(ownerId === 'unassigned' ? { ownerId: null } : ownerId ? { ownerId } : {}),
    ...(search && {
      OR: [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ],
    }),
  };

  const [items, total] = await Promise.all([
    prisma.workItem.findMany({
      where,
      include: {
        creator: { select: { id: true, name: true, email: true, image: true } },
        owner: { select: { id: true, name: true, email: true, image: true } },
        team: { select: { id: true, name: true } },
        _count: { select: { activities: true, comments: true, approvals: true } },
      },
      orderBy: [{ [sortBy]: sortOrder }, { id: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.workItem.count({ where }),
  ]);

  return NextResponse.json({
    items,
    pagination: {
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit)),
    },
  });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sessionUser = session.user as { id: string; role?: string };
  const userId = sessionUser.id;

  try {
    const body = await request.json();
    const parsed = CreateWorkItemSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 });
    }

    const parsedKey = IdempotencyKeySchema.safeParse(request.headers.get('Idempotency-Key'));
    if (!parsedKey.success) {
      return NextResponse.json({ error: 'A valid Idempotency-Key header is required' }, { status: 400 });
    }

    const { title, description, type, status, priority, ownerId, teamId, dueDate, requiresApproval } = parsed.data;
    const ownerUserId = ownerId ?? null;
    const idempotencyKey = parsedKey.data;
    const requestHash = createHash('sha256').update(JSON.stringify({
      title,
      description: description ?? null,
      type,
      status,
      priority,
      ownerId: ownerUserId,
      teamId,
      dueDate: dueDate ? new Date(dueDate).toISOString() : null,
      requiresApproval,
    })).digest('hex');

    const memberships = await prisma.teamMember.findMany({
      where: {
        teamId,
        userId: { in: ownerUserId ? [userId, ownerUserId] : [userId] },
      },
      select: { userId: true, teamId: true, role: true },
    });
    const membership = memberships.find((member) => member.userId === userId);
    const authUser = { id: userId, role: sessionUser.role ?? 'MEMBER' };

    if (!membership && !isAdmin(authUser)) {
      return NextResponse.json({ error: 'Forbidden - you are not a member of this team' }, { status: 403 });
    }

    if (ownerUserId) {
      const ownerMembership = memberships.find((member) => member.userId === ownerUserId);
      if (!ownerMembership) {
        return NextResponse.json({ error: 'Owner is not a member of this team' }, { status: 400 });
      }
    }

    const authContext = {
      user: authUser,
      workItem: { id: 'new', teamId, creatorId: userId, ownerId: ownerUserId, assigneeId: ownerUserId },
      memberships,
    };

    if (ownerUserId && !canAssignWork(authContext)) {
      return NextResponse.json({ error: 'Forbidden - only team leads or admins can assign work' }, { status: 403 });
    }

    if ((status !== 'TODO' || priority !== 'MEDIUM') && !canChangePriorityStatus(authContext, { status, priority })) {
      return NextResponse.json({ error: 'Forbidden - insufficient permission to set status or priority' }, { status: 403 });
    }

    let workItem: CreatedWorkItem;
    try {
      workItem = await prisma.$transaction(async (tx) => {
        const item = await tx.workItem.create({
          data: {
            title,
            description,
            type,
            status,
            priority,
            requiresApproval,
            dueDate: dueDate ? new Date(dueDate) : null,
            creatorId: userId,
            ownerId: ownerUserId,
            assigneeId: ownerUserId,
            teamId,
            idempotencyKey,
            idempotencyHash: requestHash,
          },
          include: CreatedWorkItemInclude,
        });

        await tx.activityLog.create({
          data: {
            workItemId: item.id,
            userId,
            action: 'CREATED',
            details: { title, type, status, priority, ownerId: ownerUserId, dueDate, requiresApproval },
          },
        });

        return item;
      });
    } catch (error) {
      const racedItem = await prisma.workItem.findUnique({
        where: { idempotencyKey },
        include: CreatedWorkItemInclude,
      });
      if (racedItem) return replayWorkItem(racedItem, userId, requestHash);
      throw error;
    }

    return NextResponse.json({ workItem: publicWorkItem(workItem) }, { status: 201 });
  } catch (error) {
    console.error('Create work item error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
