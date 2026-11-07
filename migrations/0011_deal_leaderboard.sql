create table if not exists deal_board (
  id text primary key,
  as_of text not null default '',
  as_of_label text not null default '',
  range_label text not null default '',
  uploaded_at timestamptz not null default now()
);

create table if not exists deal_board_rows (
  position integer primary key,
  name text not null,
  gross double precision not null
);
