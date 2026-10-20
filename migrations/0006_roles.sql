alter table members drop constraint if exists members_role_check;
alter table members add constraint members_role_check check (role in ('admin', 'staff', 'agent'));

-- Staff used to mean every non-admin. Keep people already marked staff on Deal Desk.
update members m
set role = 'agent'
where m.role = 'staff'
  and not exists (
    select 1 from desk_members d
    where d.user_id = m.user_id and d.role = 'staff'
  );
