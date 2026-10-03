import { describe, expect, it } from 'vitest';
import {
  canApproveWork,
  canAssignWork,
  canChangePriorityStatus,
  canEditWork,
  canViewWork,
  type AuthUser,
  type TeamMembership,
  type WorkAuthorizationSubject,
} from './authorization';

const work: WorkAuthorizationSubject = {
  id: 'work-1',
  teamId: 'team-a',
  creatorId: 'creator',
  assigneeId: 'assignee',
};

const memberships: TeamMembership[] = [
  { userId: 'lead', teamId: 'team-a', role: 'TEAM_LEAD' },
  { userId: 'member', teamId: 'team-a', role: 'MEMBER' },
  { userId: 'approver', teamId: 'team-a', role: 'APPROVER' },
  { userId: 'assignee', teamId: 'team-a', role: 'MEMBER' },
  { userId: 'outsider', teamId: 'team-b', role: 'TEAM_LEAD' },
];

function ctx(user: AuthUser, workItem = work) {
  return { user, workItem, memberships };
}

describe('authorization helpers', () => {
  it('allows authorized users to view, edit, assign, change state, and approve work', () => {
    expect(canViewWork(ctx({ id: 'member', role: 'MEMBER' }))).toBe(true);
    expect(canEditWork(ctx({ id: 'assignee', role: 'MEMBER' }))).toBe(true);
    expect(canAssignWork(ctx({ id: 'lead', role: 'MEMBER' }))).toBe(true);
    expect(canChangePriorityStatus(ctx({ id: 'lead', role: 'MEMBER' }), { priority: 'URGENT' })).toBe(true);
    expect(canChangePriorityStatus(ctx({ id: 'approver', role: 'MEMBER' }), { status: 'DONE' })).toBe(true);
    expect(canApproveWork(ctx({ id: 'approver', role: 'MEMBER' }), { reviewerId: 'approver', status: 'PENDING' })).toBe(true);
  });

  it('rejects unauthorized users for privileged work actions', () => {
    expect(canAssignWork(ctx({ id: 'member', role: 'MEMBER' }))).toBe(false);
    expect(canChangePriorityStatus(ctx({ id: 'member', role: 'MEMBER' }), { priority: 'HIGH' })).toBe(false);
    expect(canApproveWork(ctx({ id: 'member', role: 'MEMBER' }), { reviewerId: 'member', status: 'PENDING' })).toBe(false);
  });

  it('rejects cross-team access even when the user leads another team', () => {
    const user = { id: 'outsider', role: 'MEMBER' };

    expect(canViewWork(ctx(user))).toBe(false);
    expect(canEditWork(ctx(user))).toBe(false);
    expect(canAssignWork(ctx(user))).toBe(false);
    expect(canChangePriorityStatus(ctx(user), { status: 'IN_REVIEW' })).toBe(false);
    expect(canApproveWork(ctx(user), { reviewerId: 'outsider', status: 'PENDING' })).toBe(false);
  });

  it('allows admins across teams', () => {
    const user = { id: 'admin', role: 'ADMIN' };

    expect(canViewWork(ctx(user))).toBe(true);
    expect(canEditWork(ctx(user))).toBe(true);
    expect(canAssignWork(ctx(user))).toBe(true);
    expect(canChangePriorityStatus(ctx(user), { priority: 'URGENT' })).toBe(true);
    expect(canApproveWork(ctx(user), { reviewerId: 'someone-else', status: 'PENDING' })).toBe(true);
  });
});
