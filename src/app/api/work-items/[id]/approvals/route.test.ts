import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PATCH, POST } from './route';

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  prisma: {
    $transaction: vi.fn(),
    approval: { findUnique: vi.fn() },
    workItem: { findUnique: vi.fn() },
  },
  tx: {
    approval: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn() },
    workItem: { update: vi.fn() },
    activityLog: { create: vi.fn() },
  },
}));

vi.mock('next-auth', () => ({ getServerSession: mocks.getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {}, prisma: mocks.prisma }));
vi.mock('@/lib/authorization', () => ({
  canApproveWork: (context: { user: { id: string; role: string } }, approval: { reviewerId: string }) =>
    context.user.role === 'ADMIN' || (context.user.id === approval.reviewerId && context.user.id === '00000000-0000-4000-8000-000000000002'),
  canEditWork: (context: { user: { id: string }; workItem: { creatorId: string } }) =>
    context.user.id === context.workItem.creatorId,
  canViewWork: () => true,
}));

const params = { params: Promise.resolve({ id: 'work-1' }) };
const teamMembers = [
  { userId: 'creator', teamId: 'team-1', role: 'MEMBER' },
  { userId: '00000000-0000-4000-8000-000000000002', teamId: 'team-1', role: 'APPROVER' },
];

function workItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'work-1',
    version: 3,
    status: 'IN_REVIEW',
    requiresApproval: true,
    deletedAt: null,
    creatorId: 'creator',
    teamId: 'team-1',
    team: { members: teamMembers },
    ...overrides,
  };
}

function request(method: string, body: unknown) {
  return new Request('http://localhost/api/work-items/work-1/approvals', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('work item approvals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerSession.mockResolvedValue({ user: { id: 'creator', role: 'MEMBER' } });
    mocks.prisma.$transaction.mockImplementation((callback) => callback(mocks.tx));
    mocks.prisma.workItem.findUnique.mockResolvedValue(workItem());
    mocks.tx.approval.findFirst.mockResolvedValue(null);
    mocks.tx.approval.create.mockResolvedValue({ id: 'approval-1', status: 'PENDING' });
    mocks.tx.approval.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.approval.findUnique.mockResolvedValue({ id: 'approval-1', status: 'APPROVED' });
  });

  it('creates a pending request and records its activity transactionally', async () => {
    const response = await POST(request('POST', { reviewerId: '00000000-0000-4000-8000-000000000002' }), params);

    expect(response.status).toBe(201);
    expect(mocks.tx.workItem.update).toHaveBeenCalledWith({
      where: { id: 'work-1', version: 3 },
      data: { version: { increment: 1 } },
    });
    expect(mocks.tx.activityLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'APPROVAL_REQUESTED', workItemId: 'work-1' }),
    }));
  });

  it('rejects a second pending request', async () => {
    mocks.tx.approval.findFirst.mockResolvedValue({ id: 'existing' });

    const response = await POST(request('POST', { reviewerId: '00000000-0000-4000-8000-000000000002' }), params);

    expect(response.status).toBe(409);
    expect(mocks.tx.approval.create).not.toHaveBeenCalled();
    expect(mocks.tx.activityLog.create).not.toHaveBeenCalled();
  });

  it('requires a rejection reason', async () => {
    const response = await PATCH(request('PATCH', { approvalId: '00000000-0000-4000-8000-000000000001', status: 'REJECTED' }), params);

    expect(response.status).toBe(400);
    expect(mocks.prisma.approval.findUnique).not.toHaveBeenCalled();
  });

  it('blocks a member who is not the assigned reviewer', async () => {
    mocks.getServerSession.mockResolvedValue({ user: { id: 'creator', role: 'MEMBER' } });
    mocks.prisma.approval.findUnique.mockResolvedValue({
      id: 'approval-1',
      workItemId: 'work-1',
      reviewerId: 'reviewer',
      status: 'PENDING',
      workItem: workItem(),
    });

    const response = await PATCH(request('PATCH', {
      approvalId: '00000000-0000-4000-8000-000000000001',
      status: 'APPROVED',
    }), params);

    expect(response.status).toBe(403);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('updates the approval and records activity in one transaction', async () => {
    mocks.getServerSession.mockResolvedValue({ user: { id: '00000000-0000-4000-8000-000000000002', role: 'MEMBER' } });
    mocks.prisma.approval.findUnique.mockResolvedValue({
      id: 'approval-1',
      workItemId: 'work-1',
      reviewerId: '00000000-0000-4000-8000-000000000002',
      status: 'PENDING',
      note: null,
      workItem: workItem(),
    });

    const response = await PATCH(request('PATCH', {
      approvalId: '00000000-0000-4000-8000-000000000001',
      status: 'REJECTED',
      note: 'Needs a security review',
    }), params);

    expect(response.status).toBe(200);
    expect(mocks.tx.approval.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'approval-1', workItemId: 'work-1', status: 'PENDING' },
      data: expect.objectContaining({ status: 'REJECTED', note: 'Needs a security review' }),
    }));
    expect(mocks.tx.activityLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'REJECTED', details: expect.objectContaining({ reason: 'Needs a security review' }) }),
    }));
  });
});