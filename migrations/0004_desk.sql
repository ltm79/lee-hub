create table if not exists desk_packets (
  id text primary key,
  user_id text not null,
  kind text not null,
  status text not null,
  answers jsonb not null,
  files jsonb not null default '[]'::jsonb,
  created_at bigint not null,
  updated_at bigint not null,
  submitted_at bigint
);

create index if not exists desk_packets_user_idx on desk_packets (user_id, updated_at desc);

create table if not exists desk_settings (
  user_id text primary key,
  default_email text not null default ''
);

create table if not exists desk_files (
  id text primary key,
  packet_id text not null,
  user_id text not null,
  name text not null,
  mime text not null,
  slot text not null,
  bytes bytea not null
);

create index if not exists desk_files_user_idx on desk_files (user_id, packet_id);

create table if not exists desk_members (
  user_id text primary key,
  username text not null unique,
  name text not null,
  role text not null,
  office text not null default '',
  active boolean not null default true
);

create index if not exists desk_members_role_idx on desk_members (role);
