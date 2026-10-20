create table if not exists library_nodes (
  id text primary key,
  parent_id text references library_nodes (id) on delete cascade,
  kind text not null check (kind in ('folder', 'file')),
  name text not null,
  mime text not null default '',
  size_bytes integer not null default 0,
  content text,
  created_at timestamptz not null default now()
);

create index if not exists library_parent_idx on library_nodes (parent_id, kind, name);
