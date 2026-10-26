import { describe, expect, it } from 'vitest';

import { primaryAdminSuccessorPresentation } from './presentation.js';

describe('Primary Admin successor presentation', () => {
  it('[AC-021] separates the Primary proposal from Central approval', () => {
    expect(primaryAdminSuccessorPresentation({
      viewerRole: 'Primary Admin', state: 'NONE',
    })).toMatchObject({ canPropose: true, canApprove: false });
    expect(primaryAdminSuccessorPresentation({
      viewerRole: 'Gym Admin', state: 'PENDING',
    })).toMatchObject({ canPropose: false, canApprove: false });
    expect(primaryAdminSuccessorPresentation({
      viewerRole: 'Central', state: 'PENDING',
    })).toMatchObject({
      canPropose: false,
      canApprove: true,
      stateLabel: 'Ожидает одобрения Central',
      explanation: 'До одобрения Central роли и возможности администраторов не меняются.',
    });
  });
});
