import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PATCH } from './route';

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  prisma: {
    $transaction: vi.fn(),
  },
}));

vi.mock('next-auth', () => ({
  getServerSession: mocks.getServerSession,
}));

vi.mock('../../../../lib/auth', () => ({
  authOptions: {},
  prisma: mocks.prisma,
}));

type WorkItemState = {
  id: string;
  title: string;
  description: string | null;
  type: 'TASK' | 'BUG' | 'FEATURE' | 'INCIDENT';
  status: 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  requiresApproval: boolean;
  version: number;
  dueDate: Date | null;
  deletedAt: Date | null;
  creatorId: string;
  ownerId: string | null;
  assigneeId: string | null;
  teamId: string;
  team: { id: string; members: Array<{ userId: string; teamId: string; role: 'MEMBER' | 'TEAM_LEAD' | 'APPROVER' }> };
  approvals: Array<{ status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' }>;
};

const params = { params: Promise.resolve({ id: 'work-1' }) };

function baseWorkItem(overrides: Partial<WorkItemState> = {}): WorkItemState {
  return {
    id: 'work-1',
    title: 'Original title',
    description: null,
    type: 'TASK',
    status: 'TODO',
    priority: 'MEDIUM',
    requiresApproval: false,
    version: 1,
    dueDate: null,
    deletedAt: null,
    creatorId: 'creator',
    ownerId: null,
    assigneeId: null,
    teamId: 'team-1',
    team: {
      id: 'team-1',
      members: [
        { userId: 'creator', teamId: 'team-1', role: 'TEAM_LEAD' },
        { userId: 'member-a', teamId: 'team-1', role: 'MEMBER' },
        { userId: 'member-b', teamId: 'team-1', role: 'MEMBER' },
      ],
    },
    approvals: [],
    ...overrides,
  };
}

function cloneForRead(state: WorkItemState) {
  return {
    ...state,
    team: { id: state.team.id, members: state.team.members.map((member) => ({ ...member })) },
    approvals: state.approvals.map((approval) => ({ ...approval })),
  };
}

function setupTransaction(initial: WorkItemState, updateDelayMs = 0) {
  let state = initial;
  const activities: Array<{ action: string; details: unknown; userId: string; workItemId: string }> = [];

  mocks.prisma.$transaction.mockImplementation(async (callback) => {
    const tx = {
      workItem: {
        findUnique: vi.fn(async () => cloneForRead(state)),
        update: vi.fn(async ({ where, data }) => {
          if (updateDelayMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, updateDelayMs));
          }

          if (where.id !== state.id || where.version !== state.version || ('ownerId' in where && where.ownerId !== state.ownerId)) {
            const error = new Error('Record not found') as Error & { code: string };
            error.code = 'P2025';
            throw error;
          }

          state = {
            ...state,
            title: typeof data.title === 'string' ? data.title : state.title,
            priority: typeof data.priority === 'string' ? data.priority : state.priority,
            status: typeof data.status === 'string' ? data.status : state.status,
            ownerId: data.owner?.connect?.id ?? (data.owner?.disconnect ? null : state.ownerId),
            assigneeId: data.assignee?.connect?.id ?? (data.assignee?.disconnect ? null : state.assigneeId),
            version: state.version + (data.version?.increment ?? 0),
          };

          return {
            ...state,
            creator: { id: state.creatorId, name: 'Creator', email: 'creator@example.com', image: null },
            owner: state.ownerId ? { id: state.ownerId, name: state.ownerId, email: `${state.ownerId}@example.com`, image: null } : null,
            team: { id: state.teamId, name: 'Team' },
          };
        }),
      },
      activityLog: {
        create: vi.fn(async ({ data }) => {
          activities.push(data);
          return data;
        }),
      },
    };

    return callback(tx);
  });

  return {
    get state() {
      return state;
    },
    activities,
  };
}

async function patch(body: Record<string, unknown>) {
  return PATCH(
    new Request('http://localhost/api/work-items/work-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    params
  );
}

describe('work item concurrency protection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerSession.mockResolvedValue({ user: { id: 'creator', role: 'MEMBER' } });
  });

  it('rejects stale updates with HTTP 409 without overwriting state', async () => {
    const db = setupTransaction(baseWorkItem({ version: 2 }));

    const response = await patch({ title: 'Stale write', version: 1 });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toMatchObject({ code: 'VERSION_CONFLICT' });
    expect(db.state.title).toBe('Original title');
    expect(db.state.version).toBe(2);
    expect(db.activities).toHaveLength(0);
  });

  it('accepts a valid update and increments the version', async () => {
    const db = setupTransaction(baseWorkItem());

    const response = await patch({ title: 'Fresh write', version: 1 });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.workItem).toMatchObject({ title: 'Fresh write', version: 2 });
    expect(db.state).toMatchObject({ title: 'Fresh write', version: 2 });
    expect(db.activities).toEqual([
      expect.objectContaining({ action: 'UPDATED_TITLE', workItemId: 'work-1', userId: 'creator' }),
    ]);
  });

  it('requires the latest approval to be approved before completing work', async () => {
    const db = setupTransaction(baseWorkItem({
      status: 'IN_REVIEW',
      requiresApproval: true,
      approvals: [{ status: 'PENDING' }, { status: 'APPROVED' }],
    }));

    const response = await patch({ status: 'DONE', version: 1 });

    expect(response.status).toBe(422);
    expect(db.state.status).toBe('IN_REVIEW');
    expect(db.activities).toHaveLength(0);
  });

  it('allows only one simultaneous claim to succeed and leaves a consistent final state', async () => {
    const db = setupTransaction(baseWorkItem(), 5);
    mocks.getServerSession
      .mockResolvedValueOnce({ user: { id: 'member-a', role: 'MEMBER' } })
      .mockResolvedValueOnce({ user: { id: 'member-b', role: 'MEMBER' } });

    const [first, second] = await Promise.all([
      patch({ claim: true, version: 1 }),
      patch({ claim: true, version: 1 }),
    ]);
    const statuses = [first.status, second.status].sort();
    const bodies = await Promise.all([first.json(), second.json()]);

    expect(statuses).toEqual([200, 409]);
    expect(bodies.some((body) => body.code === 'VERSION_CONFLICT')).toBe(true);
    expect(['member-a', 'member-b']).toContain(db.state.ownerId);
    expect(db.state.assigneeId).toBe(db.state.ownerId);
    expect(db.state.version).toBe(2);
    expect(db.activities).toHaveLength(1);
    expect(db.activities[0]).toMatchObject({ action: 'CLAIMED', workItemId: 'work-1' });
  });
});
