import { describe, expect, it } from 'vitest';
import { computeWorkflowStage, extractStageTokens } from '../src/lib/stage.js';

describe('workflow stage derivation', () => {
  it('returns unknown when no stage labels', () => {
    expect(computeWorkflowStage(undefined)).toEqual({ stage: 'unknown', hasMultiple: false });
    expect(computeWorkflowStage([])).toEqual({ stage: 'unknown', hasMultiple: false });
  });

  it('returns token when one stage label', () => {
    expect(computeWorkflowStage(['stage:in_progress']).stage).toBe('in_progress');
  });

  it('is case-insensitive', () => {
    expect(computeWorkflowStage(['STAGE:PRD_COMPLETE']).stage).toBe('prd_complete');
  });

  it('selects most mature stage when multiple stage labels present', () => {
    expect(computeWorkflowStage(['stage:idea', 'stage:planned']).stage).toBe('planned');
    expect(computeWorkflowStage(['stage:in_review', 'stage:in_progress']).stage).toBe('in_review');
  });

  it('extracts only known stage tokens', () => {
    expect(extractStageTokens(['stage:nope', 'stage:prd_complete', 'other'])).toEqual(['prd_complete']);
  });
});
