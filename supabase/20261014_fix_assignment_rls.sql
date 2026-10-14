-- Safety fix for staff_assignments RLS.
-- Prevent cross-organization references to users/staff while keeping the existing member workflow.

begin;

drop policy if exists assignments_insert_member on public.staff_assignments;
create policy assignments_insert_member
on public.staff_assignments
for insert
to authenticated
with check (
  private.is_org_member(staff_assignments.organization_id)
  and staff_assignments.created_by = auth.uid()
  and staff_assignments.updated_by = auth.uid()
  and exists (
    select 1
    from public.clients c
    where c.id = staff_assignments.client_id
      and c.organization_id = staff_assignments.organization_id
      and c.is_active = true
  )
  and (
    staff_assignments.assigned_user_id is null
    or exists (
      select 1
      from public.organization_members m
      where m.organization_id = staff_assignments.organization_id
        and m.user_id = staff_assignments.assigned_user_id
    )
  )
  and (
    staff_assignments.assigned_staff_id is null
    or exists (
      select 1
      from public.organization_staff s
      where s.id = staff_assignments.assigned_staff_id
        and s.organization_id = staff_assignments.organization_id
        and s.is_active = true
    )
  )
);

drop policy if exists assignments_update_member on public.staff_assignments;
create policy assignments_update_member
on public.staff_assignments
for update
to authenticated
using (
  private.is_org_member(staff_assignments.organization_id)
)
with check (
  private.is_org_member(staff_assignments.organization_id)
  and staff_assignments.updated_by = auth.uid()
  and exists (
    select 1
    from public.clients c
    where c.id = staff_assignments.client_id
      and c.organization_id = staff_assignments.organization_id
      and c.is_active = true
  )
  and (
    staff_assignments.assigned_user_id is null
    or exists (
      select 1
      from public.organization_members m
      where m.organization_id = staff_assignments.organization_id
        and m.user_id = staff_assignments.assigned_user_id
    )
  )
  and (
    staff_assignments.assigned_staff_id is null
    or exists (
      select 1
      from public.organization_staff s
      where s.id = staff_assignments.assigned_staff_id
        and s.organization_id = staff_assignments.organization_id
        and s.is_active = true
    )
  )
);

commit;
