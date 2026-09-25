begin;

insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data)
values ('00000000-0000-4000-8000-000000000001', 'check@example.com', 'authenticated', 'authenticated',
        '{"provider":"google"}', '{"full_name":"Check User"}');

do $$
declare p public.profiles;
begin
    select * into p from public.profiles where id = '00000000-0000-4000-8000-000000000001';
    if p.status <> 'pending' or p.full_name <> 'Check User' or p.signup_provider <> 'google' or p.email <> 'check@example.com' then
        raise exception 'FAIL: profile not created as expected: %', row_to_json(p);
    end if;
    raise notice 'ok: profile auto-created as pending';
end $$;

update auth.users set phone = '919876543210', phone_confirmed_at = now() where id = '00000000-0000-4000-8000-000000000001';
do $$ begin
    if (select phone from public.profiles where id = '00000000-0000-4000-8000-000000000001') <> '+919876543210' then
        raise exception 'FAIL: verified phone not synced';
    end if;
    raise notice 'ok: verified phone synced as E.164';
end $$;

set local role authenticated;
select set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-8000-000000000001","session_id":"00000000-0000-4000-8000-0000000000aa","role":"authenticated"}', true);

select public.claim_session();
do $$ begin
    if (select current_session_id from public.profiles where id = auth.uid()) <> '00000000-0000-4000-8000-0000000000aa' then
        raise exception 'FAIL: claim_session did not record the session';
    end if;
    raise notice 'ok: claim_session records current session';
end $$;

update public.profiles set full_name = 'Renamed' where id = auth.uid();

do $$ begin
    begin
        update public.profiles set status = 'approved' where id = auth.uid();
        raise exception 'FAIL: user could change own status';
    exception when insufficient_privilege then
        raise notice 'ok: status change blocked for users';
    end;
    begin
        update public.profiles set role = 'admin' where id = auth.uid();
        raise exception 'FAIL: user could make themselves admin';
    exception when insufficient_privilege then
        raise notice 'ok: role change blocked for users';
    end;
    begin
        perform * from public.admin_audit_log;
        raise exception 'FAIL: user could read the audit log';
    exception when insufficient_privilege then
        raise notice 'ok: audit log hidden from users';
    end;
end $$;

rollback;
