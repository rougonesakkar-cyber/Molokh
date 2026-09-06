create index role_grants_active_venue_admins_idx
  on community.role_grants (scope_id, role, user_id)
  where state = 'ACTIVE'
    and scope_type = 'VENUE'
    and role in ('PRIMARY_ADMIN', 'GYM_ADMIN');

create index role_grants_active_global_central_idx
  on community.role_grants (user_id)
  where state = 'ACTIVE'
    and scope_type = 'GLOBAL'
    and role = 'CENTRAL_ADMIN';
