-- byome: export the database setup (read-only, changes nothing)
select * from (
  select 1 as ord, 'table' as kind, c.relname::text as name,
    string_agg(a.attname || ' ' || format_type(a.atttypid, a.atttypmod)
      || case when a.attnotnull then ' not null' else '' end
      || coalesce(' default ' || pg_get_expr(d.adbin, d.adrelid), ''),
      E'\n' order by a.attnum) as definition
  from pg_class c
  join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
  left join pg_attrdef d on d.adrelid = c.oid and d.adnum = a.attnum
  where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
  group by c.relname

  union all
  select 2, 'constraint', conrelid::regclass::text || '.' || conname, pg_get_constraintdef(oid)
  from pg_constraint where connamespace = 'public'::regnamespace

  union all
  select 3, 'index', tablename || '.' || indexname, indexdef
  from pg_indexes where schemaname = 'public'

  union all
  select 4, 'security', relname::text, case when relrowsecurity then 'RLS ON' else 'RLS OFF' end
  from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'

  union all
  select 5, 'policy', schemaname || '.' || tablename || '.' || policyname,
    format('%s for %s to %s using (%s) with check (%s)', permissive, cmd,
      array_to_string(roles, ','), coalesce(qual, '-'), coalesce(with_check, '-'))
  from pg_policies where schemaname in ('public', 'storage')

  union all
  select 6, 'view', viewname::text, definition
  from pg_views where schemaname = 'public'

  union all
  select 7, 'function', p.proname::text, pg_get_functiondef(p.oid)
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.prokind in ('f', 'p')
    and not exists (select 1 from pg_depend e where e.objid = p.oid and e.deptype = 'e')

  union all
  select 8, 'trigger', n.nspname || '.' || c.relname || '.' || t.tgname, pg_get_triggerdef(t.oid)
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where not t.tgisinternal
    and (n.nspname = 'public' or (n.nspname = 'auth' and c.relname = 'users'))

  union all
  select 9, 'storage bucket', id::text, 'public: ' || public::text
  from storage.buckets
) everything
order by ord, name;
