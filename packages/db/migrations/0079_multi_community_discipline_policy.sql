insert into platform.feature_flags (feature_key, enabled, reason, version)
values (
  'MULTI_COMMUNITY_DISCIPLINE', false,
  'Disabled by default; enable only for an explicitly approved multi-Community pilot',
  1
);

drop index community.memberships_one_active_competitive_per_user_uq;

create function community.guard_competitive_membership_policy()
returns trigger language plpgsql as $$
declare
  policy_enabled boolean;
begin
  if new.state <> 'ACTIVE' or not new.competition_enabled then
    return new;
  end if;

  perform 1 from identity.users where user_id = new.user_id for update;
  select enabled into policy_enabled
  from platform.feature_flags
  where feature_key = 'MULTI_COMMUNITY_DISCIPLINE';

  if not coalesce(policy_enabled, false) and exists (
    select 1
    from community.community_memberships as membership
    where membership.user_id = new.user_id
      and membership.state = 'ACTIVE'
      and membership.competition_enabled
      and membership.membership_id <> new.membership_id
  ) then
    raise exception 'MVP_ACTIVE_COMMUNITY_LIMIT';
  end if;
  return new;
end;
$$;

create trigger community_memberships_competitive_policy_guard
before insert or update of user_id, state, competition_enabled
on community.community_memberships
for each row execute function community.guard_competitive_membership_policy();

create function competition.guard_discipline_policy()
returns trigger language plpgsql as $$
declare
  policy_enabled boolean;
begin
  if new.discipline_key is null then
    return new;
  end if;
  select enabled into policy_enabled
  from platform.feature_flags
  where feature_key = 'MULTI_COMMUNITY_DISCIPLINE';
  if not coalesce(policy_enabled, false) then
    raise exception 'MULTI_COMMUNITY_DISCIPLINE_DISABLED';
  end if;
  return new;
end;
$$;

create trigger competitions_discipline_policy_guard
before insert or update of discipline_key on competition.competitions
for each row execute function competition.guard_discipline_policy();

alter table identity.athlete_profiles
  add constraint athlete_profiles_primary_community_fk
  foreign key (primary_community_id)
  references community.communities(community_id);

create function identity.guard_primary_community()
returns trigger language plpgsql as $$
declare
  primary_venue_id uuid;
begin
  if new.primary_community_id is null then
    return new;
  end if;

  select community.venue_id into primary_venue_id
  from community.communities as community
  where community.community_id = new.primary_community_id
    and community.state = 'ACTIVE';

  if primary_venue_id is null or not exists (
    select 1
    from community.community_memberships as membership
    where membership.community_id = new.primary_community_id
      and membership.user_id = new.user_id
      and membership.state = 'ACTIVE'
      and membership.competition_enabled
  ) then
    raise exception 'PRIMARY_COMMUNITY_MEMBERSHIP_REQUIRED';
  end if;
  if new.home_venue_id is not null and new.home_venue_id <> primary_venue_id then
    raise exception 'PRIMARY_COMMUNITY_HOME_VENUE_MISMATCH';
  end if;
  return new;
end;
$$;

create trigger athlete_profiles_primary_community_guard
before insert or update of primary_community_id, home_venue_id
on identity.athlete_profiles
for each row execute function identity.guard_primary_community();

create function community.guard_primary_membership_release()
returns trigger language plpgsql as $$
begin
  if (new.state <> 'ACTIVE' or not new.competition_enabled)
    and exists (
      select 1 from identity.athlete_profiles as profile
      where profile.user_id = old.user_id
        and profile.primary_community_id = old.community_id
    ) then
    raise exception 'PRIMARY_COMMUNITY_MUST_BE_REASSIGNED';
  end if;
  return new;
end;
$$;

create trigger community_memberships_primary_release_guard
before update of state, competition_enabled on community.community_memberships
for each row execute function community.guard_primary_membership_release();
