create extension if not exists btree_gist;

create schema if not exists scheduling;

create table scheduling.slots (
  slot_id uuid primary key,
  venue_id uuid not null references community.venues(venue_id),
  coach_user_id uuid not null references identity.users(user_id),
  start_at timestamptz not null,
  end_at timestamptz not null,
  slot_type text not null check (slot_type in ('PERSONAL', 'GROUP_REFERENCE')),
  state text not null check (
    state in ('PUBLISHED', 'BOOKED', 'WITHDRAWN', 'EXPIRED', 'CANCELLED', 'COMPLETED')
  ),
  price_amount numeric(12,2),
  price_currency text,
  price_text text,
  cancellation_terms_text text,
  commercial_version integer not null check (commercial_version > 0),
  booking_id uuid,
  published_by uuid not null references identity.users(user_id),
  version bigint not null check (version > 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint slots_valid_interval_check check (end_at > start_at),
  constraint slots_structured_price_check check (
    (price_amount is null and price_currency is null)
    or (
      price_amount is not null and price_amount >= 0
      and price_currency is not null and price_currency ~ '^[A-Z]{3}$'
    )
  ),
  constraint slots_display_lengths_check check (
    (price_text is null or length(btrim(price_text)) between 1 and 240)
    and (
      cancellation_terms_text is null
      or length(btrim(cancellation_terms_text)) between 1 and 500
    )
  )
);

alter table scheduling.slots
  add constraint slots_no_active_coach_overlap_excl
  exclude using gist (
    coach_user_id with =,
    tstzrange(start_at, end_at, '[)') with &&
  ) where (state in ('PUBLISHED', 'BOOKED'));

create index slots_available_by_venue_start_idx
  on scheduling.slots (venue_id, start_at, slot_id)
  where state = 'PUBLISHED';

create table scheduling.group_offerings (
  group_offering_id uuid primary key,
  venue_id uuid not null references community.venues(venue_id),
  sport_code text not null check (sport_code ~ '^[A-Z][A-Z0-9_]{1,39}$'),
  class_label text not null check (length(btrim(class_label)) between 1 and 120),
  start_at timestamptz not null,
  end_at timestamptz not null,
  coach_display_name text,
  price_text text,
  external_info_url text,
  contact_snapshot jsonb not null,
  state text not null check (state in ('PUBLISHED', 'WITHDRAWN', 'EXPIRED')),
  published_by uuid not null references identity.users(user_id),
  version bigint not null check (version > 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint group_offerings_valid_interval_check check (end_at > start_at),
  constraint group_offerings_display_lengths_check check (
    (coach_display_name is null or length(btrim(coach_display_name)) between 1 and 120)
    and (price_text is null or length(btrim(price_text)) between 1 and 240)
    and (external_info_url is null or length(btrim(external_info_url)) between 1 and 500)
  )
);

create index group_offerings_available_by_venue_start_idx
  on scheduling.group_offerings (venue_id, start_at, group_offering_id)
  where state = 'PUBLISHED';
