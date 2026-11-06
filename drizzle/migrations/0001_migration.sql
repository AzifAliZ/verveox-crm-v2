create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare first_user boolean := not exists (select 1 from public.user_roles where role='super_admin');
begin
  insert into public.profiles(id, full_name, email, is_active)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)), new.email, first_user);
  insert into public.user_roles(user_id, role) values (new.id, case when first_user then 'super_admin'::public.app_role else 'employee'::public.app_role end);
  return new;
end $$;