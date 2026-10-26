import { describe, expect, it } from 'vitest';

import { venueVerificationPresentation } from './presentation.js';

describe('Venue verification presentation', () => {
  it('[AC-145] shows pending/active state and hides verification from ordinary Gym Admin', () => {
    expect(venueVerificationPresentation({
      viewerRole: 'Central', state: 'PENDING_VERIFICATION',
    })).toMatchObject({ stateLabel: 'Ожидает проверки Central', canVerify: true });
    expect(venueVerificationPresentation({
      viewerRole: 'Gym Admin', state: 'PENDING_VERIFICATION',
    })).toMatchObject({ stateLabel: 'Ожидает проверки Central', canVerify: false });
    expect(venueVerificationPresentation({
      viewerRole: 'Central', state: 'ACTIVE',
    })).toEqual({
      stateLabel: 'Venue активен',
      explanation: 'Можно создавать Community и публиковать Slot через обычные проверки доступа.',
      canVerify: false,
    });
  });
});
