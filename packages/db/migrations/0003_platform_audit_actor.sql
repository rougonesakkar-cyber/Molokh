alter table platform.audit_events
  add column actor_type text;

update platform.audit_events
set actor_type = case when actor_id is null then 'SYSTEM' else 'USER' end;

alter table platform.audit_events
  alter column actor_type set not null,
  add constraint audit_events_actor_type_check
    check (actor_type in ('USER', 'SYSTEM', 'PROVIDER'));

update platform.domain_events
set idempotency_key_hash = 'legacy:' || event_id::text
where idempotency_key_hash = '';

alter table platform.domain_events
  alter column idempotency_key_hash drop default,
  add constraint domain_events_idempotency_key_hash_check
    check (idempotency_key_hash <> '');
