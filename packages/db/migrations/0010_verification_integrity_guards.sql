alter table identity.account_verifications
  add constraint account_verifications_decision_shape_check
  check (
    (state = 'PENDING' and verified_at is null and decided_by is null)
    or (
      state = 'VERIFIED'
      and verified_at is not null
      and decided_by is not null
      and decision_reason is not null
      and expires_at is null
    )
    or (
      state in ('REJECTED', 'REVOKED')
      and decided_by is not null
      and decision_reason is not null
    )
    or (state = 'EXPIRED' and verified_at is not null)
  );

create index account_verifications_pending_queue_idx
  on identity.account_verifications (created_at, verification_id)
  where is_current and state = 'PENDING';
