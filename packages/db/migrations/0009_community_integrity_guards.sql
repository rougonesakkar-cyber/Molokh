alter table community.venue_configuration_versions
  add constraint venue_configuration_versions_owner_uq
  unique (venue_id, configuration_id);

alter table community.venues
  drop constraint venues_active_configuration_fk,
  add constraint venues_active_configuration_fk
  foreign key (venue_id, configuration_version_id)
  references community.venue_configuration_versions(venue_id, configuration_id)
  deferrable initially deferred;

alter table community.community_configuration_versions
  add constraint community_configuration_versions_owner_uq
  unique (community_id, configuration_id);

alter table community.communities
  drop constraint communities_active_configuration_fk,
  add constraint communities_active_configuration_fk
  foreign key (community_id, configuration_id)
  references community.community_configuration_versions(community_id, configuration_id)
  deferrable initially deferred;

create unique index role_grants_one_live_global_role_per_user_uq
  on community.role_grants (user_id, role)
  where scope_type = 'GLOBAL' and state in ('PENDING', 'ACTIVE');
