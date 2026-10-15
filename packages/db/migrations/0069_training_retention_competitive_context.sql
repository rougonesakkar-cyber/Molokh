alter table scheduling.booking_training_retentions
  drop constraint booking_training_retentions_cause_check;

alter table scheduling.booking_training_retentions
  add constraint booking_training_retentions_cause_check check (
    cause in (
      'YOUTH_CONSENT_REVOKED',
      'AGE_TRANSITION',
      'COMPETITIVE_CONTEXT_INVALIDATED'
    )
  );
