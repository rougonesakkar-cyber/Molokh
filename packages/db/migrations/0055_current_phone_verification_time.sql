-- phone_verified_at describes the currently verified phone. After a governed
-- phone change it may be later than the immutable initial activated_at value.
alter table identity.users
  drop constraint users_phone_verified_before_activation_check;
