alter table members add column if not exists operations boolean not null default false;

create table if not exists calendar_events (
  id text primary key,
  kind text not null,
  title text not null,
  note text not null default '',
  person_name text not null default '',
  user_id text not null default '',
  start_date text not null,
  end_date text not null,
  status text not null default 'pending',
  reviewer_name text not null default '',
  review_note text not null default '',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists calendar_events_span_idx on calendar_events (status, start_date, end_date);
