alter table community.role_grants
  add constraint role_grants_role_scope_check
  check (
    (role = 'CENTRAL_ADMIN' and scope_type = 'GLOBAL' and scope_id is null)
    or (role in ('PRIMARY_ADMIN', 'GYM_ADMIN') and scope_type = 'VENUE' and scope_id is not null)
    or (role = 'COACH' and scope_type in ('COMMUNITY', 'SESSION') and scope_id is not null)
  );

alter table community.role_grants
  add constraint role_grants_pending_coach_invite_shape_check
  check (
    state <> 'PENDING'
    or (
      role = 'COACH'
      and scope_type = 'COMMUNITY'
      and authorized_by is not null
      and authorized_at is null
      and expires_at is not null
    )
  );

create index role_grants_pending_coach_invites_idx
  on community.role_grants (user_id, created_at, grant_id)
  where role = 'COACH' and scope_type = 'COMMUNITY' and state = 'PENDING';
