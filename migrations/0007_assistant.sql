alter table members drop constraint if exists members_role_check;
alter table members add constraint members_role_check check (role in ('admin', 'staff', 'agent', 'assistant'));

create table if not exists assistant_links (
  assistant_id text not null references "user" ("id") on delete cascade,
  agent_id text not null references "user" ("id") on delete cascade,
  primary key (assistant_id, agent_id)
);

create index if not exists assistant_links_agent_idx on assistant_links (agent_id);
