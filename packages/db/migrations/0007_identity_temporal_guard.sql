update identity.users
set phone_verified_at = activated_at
where phone_verified_at > activated_at;

alter table identity.users
  add constraint users_phone_verified_before_activation_check
  check (phone_verified_at is null or phone_verified_at <= activated_at);
