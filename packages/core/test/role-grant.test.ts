import { describe, expect, it } from 'vitest';

import {
  InvalidRoleGrantTransitionError,
  RoleGrantPermissionDeniedError,
  RoleGrantValidationError,
  acceptCoachInviteState,
  authorizeGuestCoachState,
  appointGymAdminState,
  approvePrimaryAdminSuccessorState,
  changePrimaryAdminState,
  expireGuestCoachState,
  inviteCoachState,
  normalizeRoleReasonCode,
  proposePrimaryAdminSuccessorState,
  verifyVenueState,
} from '../src/role-grant.js';

const now = new Date('2026-09-06T12:00:00.000Z');

describe('Coach role grant policy', () => {
  it('creates a bounded pending invitation for a verified active target', () => {
    expect(
      inviteCoachState({
        actorControlsScope: true,
        communityState: 'ACTIVE',
        targetAccountState: 'ACTIVE',
        targetVerificationState: 'VERIFIED',
        invitationTtlHours: 72,
        occurredAt: now,
      }),
    ).toEqual({ state: 'PENDING', expiresAt: '2026-09-09T12:00:00.000Z' });
    expect(normalizeRoleReasonCode(' pilot_coach ')).toBe('PILOT_COACH');
  });

  it('rejects an unscoped actor or unverified target', () => {
    expect(() =>
      inviteCoachState({
        actorControlsScope: false,
        communityState: 'ACTIVE',
        targetAccountState: 'ACTIVE',
        targetVerificationState: 'VERIFIED',
        invitationTtlHours: 72,
        occurredAt: now,
      }),
    ).toThrow(RoleGrantPermissionDeniedError);
    expect(() =>
      inviteCoachState({
        actorControlsScope: true,
        communityState: 'ACTIVE',
        targetAccountState: 'ACTIVE',
        targetVerificationState: 'PENDING',
        invitationTtlHours: 72,
        occurredAt: now,
      }),
    ).toThrow(RoleGrantValidationError);
  });

  it('lets only the invitee accept before the exact expiry boundary', () => {
    const base = {
      actorIsInvitee: true,
      currentState: 'PENDING' as const,
      communityState: 'ACTIVE' as const,
      targetAccountState: 'ACTIVE' as const,
      targetVerificationState: 'VERIFIED' as const,
      expiresAt: '2026-09-09T12:00:00.000Z',
      occurredAt: new Date('2026-09-09T11:59:59.999Z'),
    };
    expect(acceptCoachInviteState(base)).toBe('ACTIVE');
    expect(() => acceptCoachInviteState({ ...base, actorIsInvitee: false })).toThrow(
      RoleGrantPermissionDeniedError,
    );
    expect(() =>
      acceptCoachInviteState({
        ...base,
        occurredAt: new Date('2026-09-09T12:00:00.000Z'),
      }),
    ).toThrow(InvalidRoleGrantTransitionError);
  });

  it('[AC-204] keeps Admin appointment and Primary transfer Central-only', () => {
    const admin = {
      actorIsCentral: true,
      venueState: 'ACTIVE' as const,
      targetAccountState: 'ACTIVE' as const,
      targetVerificationState: 'VERIFIED' as const,
    };
    expect(appointGymAdminState(admin)).toBe('ACTIVE');
    expect(() => appointGymAdminState({ ...admin, actorIsCentral: false })).toThrow(
      RoleGrantPermissionDeniedError,
    );
    expect(
      changePrimaryAdminState({
        ...admin,
        targetHasActiveGymAdmin: true,
        currentPrimaryAdminUserId: null,
        targetUserId: 'admin-1',
      }),
    ).toBe('APPOINTED');
    expect(
      changePrimaryAdminState({
        ...admin,
        targetHasActiveGymAdmin: true,
        currentPrimaryAdminUserId: 'admin-1',
        targetUserId: 'admin-2',
      }),
    ).toBe('TRANSFERRED');
  });

  it('[AC-021] keeps a Primary successor proposal inert until Central approval', () => {
    const proposal = {
      actorIsCurrentPrimary: true,
      venueState: 'ACTIVE' as const,
      targetAccountState: 'ACTIVE' as const,
      targetVerificationState: 'VERIFIED' as const,
      targetHasActiveGymAdmin: true,
      proposerUserId: 'primary-1',
      targetUserId: 'admin-2',
    };
    expect(proposePrimaryAdminSuccessorState(proposal)).toBe('PENDING');
    expect(() => proposePrimaryAdminSuccessorState({
      ...proposal, actorIsCurrentPrimary: false,
    })).toThrow(RoleGrantPermissionDeniedError);
    expect(approvePrimaryAdminSuccessorState({
      actorIsCentral: true,
      proposalState: 'PENDING',
      venueState: 'ACTIVE',
      targetAccountState: 'ACTIVE',
      targetVerificationState: 'VERIFIED',
      targetHasActiveGymAdmin: true,
      currentPrimaryAdminUserId: 'primary-1',
      proposedByUserId: 'primary-1',
      targetUserId: 'admin-2',
    })).toBe('APPROVED');
    expect(() => approvePrimaryAdminSuccessorState({
      actorIsCentral: false,
      proposalState: 'PENDING',
      venueState: 'ACTIVE',
      targetAccountState: 'ACTIVE',
      targetVerificationState: 'VERIFIED',
      targetHasActiveGymAdmin: true,
      currentPrimaryAdminUserId: 'primary-1',
      proposedByUserId: 'primary-1',
      targetUserId: 'admin-2',
    })).toThrow(RoleGrantPermissionDeniedError);
  });

  it('[AC-145] verifies a pending Venue only with Central authority and protected evidence', () => {
    expect(verifyVenueState({
      actorIsCentral: true,
      currentState: 'PENDING_VERIFICATION',
      checklistVersion: ' venue-safety-v1 ',
      evidenceReference: ' protected://venue/inspection-145 ',
    })).toEqual({
      state: 'ACTIVE',
      checklistVersion: 'venue-safety-v1',
      evidenceReference: 'protected://venue/inspection-145',
    });
    expect(() => verifyVenueState({
      actorIsCentral: false,
      currentState: 'PENDING_VERIFICATION',
      checklistVersion: 'venue-safety-v1',
      evidenceReference: 'protected://venue/inspection-145',
    })).toThrow(RoleGrantPermissionDeniedError);
    expect(() => verifyVenueState({
      actorIsCentral: true,
      currentState: 'ACTIVE',
      checklistVersion: 'venue-safety-v1',
      evidenceReference: 'protected://venue/inspection-145',
    })).toThrow(InvalidRoleGrantTransitionError);
  });

  it('requires an existing ordinary Admin grant before Primary appointment', () => {
    expect(() =>
      changePrimaryAdminState({
        actorIsCentral: true,
        venueState: 'ACTIVE',
        targetAccountState: 'ACTIVE',
        targetVerificationState: 'VERIFIED',
        targetHasActiveGymAdmin: false,
        currentPrimaryAdminUserId: null,
        targetUserId: 'admin-1',
      }),
    ).toThrow(RoleGrantValidationError);
  });

  it('[AC-019] authorizes an exact Session Guest Coach and expires only on a terminal cause', () => {
    expect(authorizeGuestCoachState({
      actorControlsScope: true,
      sessionState: 'SCHEDULED',
      targetAccountState: 'ACTIVE',
      targetVerificationState: 'VERIFIED',
      targetIsAssignedCoach: true,
      targetIsAthlete: false,
      scheduledEndAt: new Date('2026-10-20T11:00:00.000Z'),
    })).toEqual({ state: 'ACTIVE', expiresAt: '2026-11-19T11:00:00.000Z' });
    expect(expireGuestCoachState({
      currentState: 'ACTIVE', sessionState: 'ENDED', resultState: 'FINAL',
      expiresAt: '2026-11-19T11:00:00.000Z', occurredAt: now, reason: 'RESULT_FINAL',
    })).toBe('EXPIRED');
    expect(expireGuestCoachState({
      currentState: 'ACTIVE', sessionState: 'CANCELLED', resultState: null,
      expiresAt: '2026-11-19T11:00:00.000Z', occurredAt: now,
      reason: 'SESSION_CANCELLED',
    })).toBe('EXPIRED');
    expect(() => expireGuestCoachState({
      currentState: 'ACTIVE', sessionState: 'ENDED', resultState: 'RECORDED',
      expiresAt: '2026-11-19T11:00:00.000Z', occurredAt: now, reason: 'RESULT_FINAL',
    })).toThrow(InvalidRoleGrantTransitionError);
  });

  it('rejects a Guest Coach outside the exact verified non-participant assignment', () => {
    const valid = {
      actorControlsScope: true,
      sessionState: 'SCHEDULED' as const,
      targetAccountState: 'ACTIVE' as const,
      targetVerificationState: 'VERIFIED' as const,
      targetIsAssignedCoach: true,
      targetIsAthlete: false,
      scheduledEndAt: new Date('2026-10-20T11:00:00.000Z'),
    };
    expect(() => authorizeGuestCoachState({ ...valid, actorControlsScope: false }))
      .toThrow(RoleGrantPermissionDeniedError);
    expect(() => authorizeGuestCoachState({ ...valid, targetIsAssignedCoach: false }))
      .toThrow(RoleGrantValidationError);
    expect(() => authorizeGuestCoachState({ ...valid, targetIsAthlete: true }))
      .toThrow(RoleGrantValidationError);
  });
});
