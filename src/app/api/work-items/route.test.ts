import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  teamFindMany: vi.fn(),
  itemFindMany: vi.fn(),
  itemCount: vi.fn(),
  itemFindUnique: vi.fn(),
  itemCreate: vi.fn(),
  activityCreate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('next-auth', () => ({ getServerSession: mocks.getServerSession }));
vi.mock('@/lib/auth', () => ({
  authOptions: {},
  prisma: {
    teamMember: { findMany: mocks.teamFindMany },
    workItem: { findMany: mocks.itemFindMany, count: mocks.itemCount, findUnique: mocks.itemFindUnique, create: mocks.itemCreate },
    activityLog: { create: mocks.activityCreate },
    $transaction: mocks.transaction,
  },
}));
vi.mock('@/lib/authorization', () => ({
  accessibleTeamIds: (_user: unknown, memberships: Array<{ teamId: string }>) => memberships.map((membership) => membership.teamId),
  isAdmin: (user: { role?: string }) => user.role === 'ADMIN',
  canAssignWork: () => false,
  canChangePriorityStatus: () => false,
}));

describe('work item listing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerSession.mockResolvedValue({ user: { id: 'member', role: 'MEMBER' } });
    mocks.teamFindMany.mockResolvedValue([{ userId: 'member', teamId: 'team-1', role: 'MEMBER' }]);
    mocks.itemFindMany.mockResolvedValue([{ id: 'item-1' }]);
    mocks.itemCount.mockResolvedValue(13);
    mocks.itemFindUnique.mockResolvedValue(null);
    mocks.transaction.mockImplementation((callback) => callback({
      workItem: { create: mocks.itemCreate },
      activityLog: { create: mocks.activityCreate },
    }));
  });

  it('applies owner, pagination, and sort filters in the database query', async () => {
    const response = await GET(new Request('http://localhost/api/work-items?page=2&limit=12&ownerId=unassigned&sortBy=title&sortOrder=asc&search=release'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.pagination).toEqual({ total: 13, page: 2, limit: 12, pages: 2 });
    expect(mocks.itemFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        teamId: { in: ['team-1'] },
        ownerId: null,
        OR: expect.arrayContaining([
          { title: { contains: 'release', mode: 'insensitive' } },
        ]),
      }),
      orderBy: [{ title: 'asc' }, { id: 'asc' }],
      skip: 12,
      take: 12,
    }));
  });

  it('rejects a team outside the current user scope', async () => {
    const response = await GET(new Request('http://localhost/api/work-items?teamId=00000000-0000-4000-8000-000000000001'));

    expect(response.status).toBe(403);
    expect(mocks.itemFindMany).not.toHaveBeenCalled();
  });

  it('returns the existing item when the same idempotency key is submitted again', async () => {
    const idempotencyKey = 'a821ebcb-8a07-4bfe-a978-a4b360a7c772';
    const teamId = '00000000-0000-4000-8000-000000000001';
    const createdItem = {
      id: 'item-created',
      title: 'Ship release',
      description: null,
      type: 'TASK',
      status: 'TODO',
      priority: 'MEDIUM',
      requiresApproval: false,
      version: 1,
      dueDate: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      creatorId: 'member',
      ownerId: null,
      assigneeId: null,
      teamId,
      idempotencyKey,
      idempotencyHash: expect.any(String),
      creator: { id: 'member', name: 'Member', email: 'member@example.com' },
      owner: null,
      team: { id: teamId, name: 'Team' },
    };
    mocks.teamFindMany.mockResolvedValue([{ userId: 'member', teamId, role: 'MEMBER' }]);
    mocks.itemCreate.mockImplementation(async ({ data }) => ({ ...createdItem, ...data }));
    mocks.activityCreate.mockResolvedValue({});

    const makeRequest = () => new Request('http://localhost/api/work-items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ title: 'Ship release', teamId }),
    });

    const firstResponse = await (await import('./route')).POST(makeRequest());
    const firstBody = await firstResponse.json();
    const storedItem = await mocks.itemCreate.mock.results[0].value;
    mocks.transaction.mockImplementationOnce(async () => {
      throw new Error('Unique constraint violation');
    });
    mocks.itemFindUnique.mockResolvedValueOnce(storedItem);

    const secondResponse = await (await import('./route')).POST(makeRequest());
    const secondBody = await secondResponse.json();

    expect(firstResponse.status).toBe(201);
    expect(secondResponse.status).toBe(200);
    expect(secondBody.workItem.id).toBe(firstBody.workItem.id);
    expect(secondBody.workItem.idempotencyKey).toBeUndefined();
    expect(mocks.itemCreate).toHaveBeenCalledTimes(1);
    expect(mocks.transaction).toHaveBeenCalledTimes(2);
  });
});