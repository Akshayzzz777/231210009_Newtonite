const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const bcrypt = require('bcryptjs');

const adapter = new PrismaPg(process.env.DATABASE_URL || process.env.DATABASE_URL_UNPOOLED);
const prisma = new PrismaClient({ adapter });

async function main() {
  const passwordHash = await bcrypt.hash('Password123!', 10);

  const users = await Promise.all([
    prisma.user.upsert({
      where: { email: 'akshai@example.com' },
      update: {},
      create: { name: 'Akshai Praveen', email: 'akshai@example.com', role: 'ADMIN', passwordHash },
    }),
    prisma.user.upsert({
      where: { email: 'maya@example.com' },
      update: {},
      create: { name: 'Maya Raman', email: 'maya@example.com', role: 'MEMBER', passwordHash },
    }),
    prisma.user.upsert({
      where: { email: 'leo@example.com' },
      update: {},
      create: { name: 'Leo Martin', email: 'leo@example.com', role: 'MEMBER', passwordHash },
    }),
    prisma.user.upsert({
      where: { email: 'nora@example.com' },
      update: {},
      create: { name: 'Nora Shah', email: 'nora@example.com', role: 'MEMBER', passwordHash },
    }),
    prisma.user.upsert({
      where: { email: 'sam@example.com' },
      update: {},
      create: { name: 'Sam Rivera', email: 'sam@example.com', role: 'MEMBER', passwordHash },
    }),
  ]);

  const [akshai, maya, leo, nora, sam] = users;

  const product = await prisma.team.upsert({
    where: { name: 'Product Operations' },
    update: {},
    create: { name: 'Product Operations', description: 'Coordinates roadmap delivery and release readiness.' },
  });
  const platform = await prisma.team.upsert({
    where: { name: 'Platform Engineering' },
    update: {},
    create: { name: 'Platform Engineering', description: 'Owns infrastructure, developer experience, and reliability.' },
  });
  const customer = await prisma.team.upsert({
    where: { name: 'Customer Success' },
    update: {},
    create: { name: 'Customer Success', description: 'Turns customer feedback into prioritized follow-up work.' },
  });

  await Promise.all([
    prisma.teamMember.upsert({
      where: { userId_teamId: { userId: akshai.id, teamId: product.id } },
      update: { role: 'TEAM_LEAD' },
      create: { userId: akshai.id, teamId: product.id, role: 'TEAM_LEAD' },
    }),
    prisma.teamMember.upsert({
      where: { userId_teamId: { userId: maya.id, teamId: product.id } },
      update: { role: 'MEMBER' },
      create: { userId: maya.id, teamId: product.id, role: 'MEMBER' },
    }),
    prisma.teamMember.upsert({
      where: { userId_teamId: { userId: leo.id, teamId: product.id } },
      update: { role: 'MEMBER' },
      create: { userId: leo.id, teamId: product.id, role: 'MEMBER' },
    }),
    prisma.teamMember.upsert({
      where: { userId_teamId: { userId: maya.id, teamId: platform.id } },
      update: { role: 'TEAM_LEAD' },
      create: { userId: maya.id, teamId: platform.id, role: 'TEAM_LEAD' },
    }),
    prisma.teamMember.upsert({
      where: { userId_teamId: { userId: nora.id, teamId: platform.id } },
      update: { role: 'APPROVER' },
      create: { userId: nora.id, teamId: platform.id, role: 'APPROVER' },
    }),
    prisma.teamMember.upsert({
      where: { userId_teamId: { userId: sam.id, teamId: customer.id } },
      update: { role: 'TEAM_LEAD' },
      create: { userId: sam.id, teamId: customer.id, role: 'TEAM_LEAD' },
    }),
    prisma.teamMember.upsert({
      where: { userId_teamId: { userId: akshai.id, teamId: customer.id } },
      update: { role: 'MEMBER' },
      create: { userId: akshai.id, teamId: customer.id, role: 'MEMBER' },
    }),
  ]);

  async function upsertWorkItem(data) {
    const existing = await prisma.workItem.findFirst({
      where: { teamId: data.teamId, title: data.title },
      select: { id: true },
    });

    if (existing) {
      return prisma.workItem.update({
        where: { id: existing.id },
        data,
      });
    }

    return prisma.workItem.create({ data });
  }

  const onboarding = await upsertWorkItem({
    title: 'Finalize beta onboarding checklist',
    description: 'Make the beta onboarding steps explicit before the first customer cohort starts.',
    type: 'TASK',
    status: 'IN_PROGRESS',
    priority: 'HIGH',
    requiresApproval: false,
    version: 3,
    creatorId: akshai.id,
    ownerId: maya.id,
    assigneeId: maya.id,
    teamId: product.id,
    dueDate: new Date('2026-10-15T09:00:00.000Z'),
  });

  const concurrency = await upsertWorkItem({
    title: 'Instrument optimistic concurrency conflict alerts',
    description: 'Track version conflicts and surface retry guidance in operations dashboards.',
    type: 'INCIDENT',
    status: 'IN_REVIEW',
    priority: 'URGENT',
    requiresApproval: true,
    version: 5,
    creatorId: maya.id,
    ownerId: nora.id,
    assigneeId: nora.id,
    teamId: platform.id,
    dueDate: new Date('2026-10-09T12:00:00.000Z'),
  });

  const escalation = await upsertWorkItem({
    title: 'Review enterprise escalation workflow',
    description: 'Validate escalation owners, SLAs, and approval responsibilities.',
    type: 'TASK',
    status: 'TODO',
    priority: 'MEDIUM',
    requiresApproval: true,
    creatorId: sam.id,
    ownerId: akshai.id,
    assigneeId: akshai.id,
    teamId: customer.id,
    dueDate: new Date('2026-10-22T10:30:00.000Z'),
  });

  const healthReport = await upsertWorkItem({
    title: 'Draft Q4 customer health report',
    description: 'Create a first pass using renewal risk, adoption, and support volume.',
    type: 'FEATURE',
    status: 'DONE',
    priority: 'LOW',
    requiresApproval: false,
    version: 2,
    creatorId: sam.id,
    ownerId: sam.id,
    assigneeId: sam.id,
    teamId: customer.id,
  });

  async function ensureComment(data) {
    const existing = await prisma.comment.findFirst({ where: data, select: { id: true } });
    return existing ?? prisma.comment.create({ data });
  }

  await Promise.all([
    ensureComment({ workItemId: onboarding.id, authorId: maya.id, content: 'Checklist is drafted; waiting on security notes.' }),
    ensureComment({ workItemId: concurrency.id, authorId: nora.id, content: 'Alert thresholds are ready for review.' }),
    ensureComment({ workItemId: escalation.id, authorId: akshai.id, content: 'Please include the weekend support handoff.' }),
  ]);

  await Promise.all([
    prisma.approval.upsert({
      where: { workItemId_reviewerId_status: { workItemId: concurrency.id, reviewerId: maya.id, status: 'PENDING' } },
      update: { requesterId: nora.id, note: 'Please review alert copy before rollout.' },
      create: { workItemId: concurrency.id, requesterId: nora.id, reviewerId: maya.id, status: 'PENDING', note: 'Please review alert copy before rollout.' },
    }),
    prisma.approval.upsert({
      where: { workItemId_reviewerId_status: { workItemId: healthReport.id, reviewerId: akshai.id, status: 'APPROVED' } },
      update: { requesterId: sam.id, decidedAt: new Date('2026-10-02T14:00:00.000Z'), note: 'Looks ready to share.' },
      create: { workItemId: healthReport.id, requesterId: sam.id, reviewerId: akshai.id, status: 'APPROVED', decidedAt: new Date('2026-10-02T14:00:00.000Z'), note: 'Looks ready to share.' },
    }),
  ]);

  async function ensureActivity(data) {
    const existing = await prisma.activityLog.findFirst({
      where: { workItemId: data.workItemId, userId: data.userId, action: data.action },
      select: { id: true },
    });
    return existing ?? prisma.activityLog.create({ data });
  }

  await Promise.all([
    ensureActivity({ workItemId: onboarding.id, userId: akshai.id, action: 'CREATED', details: { title: onboarding.title, status: onboarding.status, priority: onboarding.priority } }),
    ensureActivity({ workItemId: onboarding.id, userId: maya.id, action: 'UPDATED', details: { status: { from: 'TODO', to: 'IN_PROGRESS' } } }),
    ensureActivity({ workItemId: onboarding.id, userId: maya.id, action: 'COMMENTED', details: 'Checklist is drafted; waiting on security notes.' }),
    ensureActivity({ workItemId: concurrency.id, userId: maya.id, action: 'CREATED', details: { title: concurrency.title, status: concurrency.status, priority: concurrency.priority } }),
    ensureActivity({ workItemId: concurrency.id, userId: nora.id, action: 'APPROVAL_REQUESTED', details: { reviewerId: maya.id } }),
    ensureActivity({ workItemId: escalation.id, userId: sam.id, action: 'CREATED', details: { title: escalation.title, status: escalation.status, priority: escalation.priority } }),
    ensureActivity({ workItemId: healthReport.id, userId: akshai.id, action: 'APPROVED', details: { reviewerId: akshai.id } }),
  ]);

  async function ensureNotification(data) {
    const existing = await prisma.notification.findFirst({
      where: { recipientId: data.recipientId, workItemId: data.workItemId, type: data.type, title: data.title },
      select: { id: true },
    });
    return existing ?? prisma.notification.create({ data });
  }

  await Promise.all([
    ensureNotification({ recipientId: maya.id, actorId: akshai.id, workItemId: onboarding.id, type: 'WORK_ITEM_ASSIGNED', title: 'New assignment', body: onboarding.title }),
    ensureNotification({ recipientId: maya.id, actorId: nora.id, workItemId: concurrency.id, type: 'APPROVAL_REQUESTED', title: 'Approval requested', body: concurrency.title }),
    ensureNotification({ recipientId: akshai.id, actorId: sam.id, workItemId: escalation.id, type: 'WORK_ITEM_ASSIGNED', title: 'New customer workflow item', body: escalation.title }),
  ]);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
