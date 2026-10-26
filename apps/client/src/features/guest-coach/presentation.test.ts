import { describe, expect, it } from 'vitest';

import { guestCoachPresentation } from './presentation.js';

describe('Guest Coach presentation', () => {
  it('[AC-019] explains exact Session scope and terminal expiry', () => {
    expect(guestCoachPresentation({
      currentRole: 'Gym Admin', viewerCanAuthorizeGuestCoach: true,
      guestCoachGrantState: null,
    })).toMatchObject({ canAuthorize: true, title: 'Авторизовать Guest Coach' });
    expect(guestCoachPresentation({
      currentRole: 'Coach', viewerCanAuthorizeGuestCoach: false,
      guestCoachGrantState: 'ACTIVE',
    })).toMatchObject({ canAuthorize: false, title: 'Guest Coach авторизован' });
    expect(guestCoachPresentation({
      currentRole: 'Athlete', viewerCanAuthorizeGuestCoach: false,
      guestCoachGrantState: null,
    })).toBeNull();
  });
});
