import { describe, expect, it } from 'vitest';

import {
  InvalidRoleGrantTransitionError,
  RoleGrantPermissionDeniedError,
  RoleGrantValidationError,
  acceptCoachInviteState,
  appointGymAdminState,
  changePrimaryAdminState,
  inviteCoachState,
  normalizeRoleReasonCode,
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

  it('keeps Admin appointment and Primary transfer Central-only', () => {
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
});
