alter table members add column if not exists shareholder boolean not null default false;
alter table office add column if not exists leaderboard_order integer not null default 0;
