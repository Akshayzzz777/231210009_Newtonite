import { describe, expect, it } from 'vitest';
import { isValidWorkItemTransition, validateWorkItemStatusTransition } from './workflow';

describe('work-item workflow', () => {
  it('allows supported forward and reopen transitions', () => {
    expect(isValidWorkItemTransition('TODO', 'IN_PROGRESS')).toBe(true);
    expect(isValidWorkItemTransition('IN_PROGRESS', 'IN_REVIEW')).toBe(true);
    expect(isValidWorkItemTransition('IN_REVIEW', 'DONE')).toBe(true);
    expect(isValidWorkItemTransition('DONE', 'IN_PROGRESS')).toBe(true);
  });

  it('rejects skipping workflow stages', () => {
    expect(isValidWorkItemTransition('TODO', 'DONE')).toBe(false);
    expect(isValidWorkItemTransition('IN_PROGRESS', 'DONE')).toBe(false);
    expect(isValidWorkItemTransition('DONE', 'TODO')).toBe(false);
  });

  it('rejects unknown statuses', () => {
    expect(isValidWorkItemTransition('TODO', 'ARCHIVED')).toBe(false);
  });

  it('requires approval before approval-gated work can be completed', () => {
    expect(validateWorkItemStatusTransition({
      from: 'IN_REVIEW',
      to: 'DONE',
      requiresApproval: true,
      hasApprovedApproval: false,
    })).toEqual({ ok: false, reason: 'This work item requires approval before it can be marked done' });
  });

  it('allows completion when approval-gated work has an approval', () => {
    expect(validateWorkItemStatusTransition({
      from: 'IN_REVIEW',
      to: 'DONE',
      requiresApproval: true,
      hasApprovedApproval: true,
    })).toEqual({ ok: true });
  });
});
