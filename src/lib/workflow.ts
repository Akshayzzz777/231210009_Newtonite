export const WORK_ITEM_STATUSES = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'] as const;
export type WorkItemStatus = (typeof WORK_ITEM_STATUSES)[number];

const transitions: Record<WorkItemStatus, readonly WorkItemStatus[]> = {
  TODO: ['TODO', 'IN_PROGRESS'],
  IN_PROGRESS: ['IN_PROGRESS', 'TODO', 'IN_REVIEW'],
  IN_REVIEW: ['IN_REVIEW', 'IN_PROGRESS', 'DONE'],
  DONE: ['DONE', 'IN_PROGRESS'],
};

export function isValidWorkItemTransition(from: string, to: string): boolean {
  return transitions[from as WorkItemStatus]?.includes(to as WorkItemStatus) ?? false;
}

export function validateWorkItemStatusTransition({
  from,
  to,
  requiresApproval,
  hasApprovedApproval,
}: {
  from: string;
  to: string;
  requiresApproval: boolean;
  hasApprovedApproval: boolean;
}): { ok: true } | { ok: false; reason: string } {
  if (!isValidWorkItemTransition(from, to)) {
    return { ok: false, reason: 'Invalid workflow transition' };
  }

  if (to === 'DONE' && requiresApproval && !hasApprovedApproval) {
    return { ok: false, reason: 'This work item requires approval before it can be marked done' };
  }

  return { ok: true };
}
