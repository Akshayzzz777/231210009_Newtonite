import type { TeamRole, UserRole, WorkItemPriority, WorkItemStatus } from '@prisma/client';

export type AuthUser = {
  id: string;
  role: UserRole | string;
};

export type TeamMembership = {
  userId: string;
  teamId: string;
  role: TeamRole | string;
};

export type WorkAuthorizationSubject = {
  id: string;
  teamId: string;
  creatorId: string;
  assigneeId: string | null;
  ownerId?: string | null;
  approvals?: Array<{ reviewerId?: string; status: string }>;
};

export type WorkAuthorizationContext = {
  user: AuthUser;
  workItem: WorkAuthorizationSubject;
  memberships: TeamMembership[];
};

export type WorkStateChange = {
  status?: WorkItemStatus | string;
  priority?: WorkItemPriority | string;
};

export function isAdmin(user: AuthUser): boolean {
  return user.role === 'ADMIN';
}

export function membershipForTeam(user: AuthUser, memberships: TeamMembership[], teamId: string) {
  return memberships.find((membership) => membership.userId === user.id && membership.teamId === teamId) ?? null;
}

export function hasTeamRole(
  user: AuthUser,
  memberships: TeamMembership[],
  teamId: string,
  roles: Array<TeamRole | string>
): boolean {
  const membership = membershipForTeam(user, memberships, teamId);
  return Boolean(membership && roles.includes(membership.role));
}

export function canViewWork({ user, workItem, memberships }: WorkAuthorizationContext): boolean {
  return isAdmin(user) || Boolean(membershipForTeam(user, memberships, workItem.teamId));
}

export function canEditWork({ user, workItem, memberships }: WorkAuthorizationContext): boolean {
  return (
    isAdmin(user) ||
    hasTeamRole(user, memberships, workItem.teamId, ['TEAM_LEAD']) ||
    workItem.creatorId === user.id ||
    workItem.assigneeId === user.id ||
    workItem.ownerId === user.id
  );
}

export function canAssignWork({ user, workItem, memberships }: WorkAuthorizationContext): boolean {
  return isAdmin(user) || hasTeamRole(user, memberships, workItem.teamId, ['TEAM_LEAD']);
}

export function canChangePriorityStatus(
  { user, workItem, memberships }: WorkAuthorizationContext,
  change: WorkStateChange
): boolean {
  if (isAdmin(user) || hasTeamRole(user, memberships, workItem.teamId, ['TEAM_LEAD'])) {
    return true;
  }

  if (change.priority !== undefined) {
    return false;
  }

  return (
    change.status !== undefined &&
    (workItem.assigneeId === user.id ||
      workItem.ownerId === user.id ||
      hasTeamRole(user, memberships, workItem.teamId, ['APPROVER']))
  );
}

export function canApproveWork(
  { user, workItem, memberships }: WorkAuthorizationContext,
  approval?: { reviewerId: string; status: string } | null
): boolean {
  if (isAdmin(user) || hasTeamRole(user, memberships, workItem.teamId, ['TEAM_LEAD'])) {
    return true;
  }

  return (
    hasTeamRole(user, memberships, workItem.teamId, ['APPROVER']) &&
    (!approval || approval.reviewerId === user.id)
  );
}

export function accessibleTeamIds(user: AuthUser, memberships: TeamMembership[]): string[] | null {
  if (isAdmin(user)) {
    return null;
  }

  return memberships.filter((membership) => membership.userId === user.id).map((membership) => membership.teamId);
}
