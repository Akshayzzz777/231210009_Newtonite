import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  findWorkItem: vi.fn(),
  transaction: vi.fn(),
  tx: { commentCreate: vi.fn(), activityCreate: vi.fn() },
}));

vi.mock('next-auth', () => ({ getServerSession: mocks.getServerSession }));
vi.mock('@/lib/auth', () => ({
  authOptions: {},
  prisma: { workItem: { findUnique: mocks.findWorkItem }, $transaction: mocks.transaction },
}));
vi.mock('@/lib/authorization', () => ({ canViewWork: () => true }));

describe('work item comments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerSession.mockResolvedValue({ user: { id: 'member-1', role: 'MEMBER' } });
    mocks.findWorkItem.mockResolvedValue({ id: 'work-1', team: { members: [] } });
    mocks.tx.commentCreate.mockResolvedValue({ id: 'comment-1', content: 'A note' });
    mocks.tx.activityCreate.mockResolvedValue({ id: 'activity-1', action: 'COMMENTED' });
    mocks.transaction.mockImplementation((callback) => callback({
      comment: { create: mocks.tx.commentCreate },
      activityLog: { create: mocks.tx.activityCreate },
    }));
  });

  it('writes the comment and activity record in one transaction', async () => {
    const response = await POST(new Request('http://localhost/api/work-items/work-1/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'A note' }),
    }), { params: Promise.resolve({ id: 'work-1' }) });

    expect(response.status).toBe(201);
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.tx.commentCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ content: 'A note' }) }));
    expect(mocks.tx.activityCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'COMMENTED' }) }));
  });

  it('rejects unauthenticated comment creation', async () => {
    mocks.getServerSession.mockResolvedValue(null);

    const response = await POST(new Request('http://localhost/api/work-items/work-1/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'A note' }),
    }), { params: Promise.resolve({ id: 'work-1' }) });

    expect(response.status).toBe(401);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});