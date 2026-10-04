create table community.membership_invites (
  invite_id uuid primary key,
  community_id uuid not null references community.communities(community_id),
  join_path text not null check (join_path in ('QR', 'INVITE')),
  token_sha256 text not null unique check (token_sha256 ~ '^[0-9a-f]{64}$'),
  age_division text check (age_division in ('YOUTH', 'ADULT')),
  state text not null check (state in ('ACTIVE', 'REVOKED', 'EXPIRED')),
  expires_at timestamptz not null,
  max_uses integer check (max_uses is null or max_uses > 0),
  used_count integer not null default 0 check (used_count >= 0),
  created_by uuid not null,
  version bigint not null check (version > 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint membership_invites_use_limit_check check (
    max_uses is null or used_count <= max_uses
  )
);

create index membership_invites_community_active_idx
  on community.membership_invites (community_id, expires_at)
  where state = 'ACTIVE';
