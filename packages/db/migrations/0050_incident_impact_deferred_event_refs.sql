alter table platform.incident_impacts
  drop constraint incident_impacts_compensating_event_id_fkey,
  add constraint incident_impacts_compensating_event_id_fkey
    foreign key (compensating_event_id) references platform.domain_events(event_id)
    deferrable initially deferred;

alter table platform.incident_timeout_compensations
  drop constraint incident_timeout_compensations_compensating_event_id_fkey,
  add constraint incident_timeout_compensations_compensating_event_id_fkey
    foreign key (compensating_event_id) references platform.domain_events(event_id)
    deferrable initially deferred;
