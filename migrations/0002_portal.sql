create table if not exists office (
  id text primary key,
  name text not null,
  city text not null default '',
  tagline text not null default ''
);

create table if not exists members (
  user_id text primary key references "user" ("id") on delete cascade,
  role text not null check (role in ('admin', 'staff', 'agent')),
  active boolean not null default true,
  title text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists categories (
  id text primary key,
  name text not null,
  sort_order integer not null default 0
);

create table if not exists links (
  id text primary key,
  category_id text not null references categories (id) on delete cascade,
  name text not null,
  url text not null,
  blurb text not null default '',
  hint text not null default '',
  icon text not null default 'link',
  sort_order integer not null default 0,
  active boolean not null default true
);

create index if not exists links_category_idx on links (category_id, sort_order);

create table if not exists favorites (
  user_id text not null references "user" ("id") on delete cascade,
  link_id text not null references links (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, link_id)
);

insert into office (id, name, city, tagline)
values (
  'main',
  'Lee & Associates',
  '',
  'Research, deals, and the systems this office runs on.'
)
on conflict (id) do nothing;

insert into categories (id, name, sort_order) values
  ('research', 'Market research', 10),
  ('deals', 'Deal tools', 20),
  ('workplace', 'Workplace', 30),
  ('firm', 'Firm', 40)
on conflict (id) do nothing;

insert into links (id, category_id, name, url, blurb, hint, icon, sort_order) values
  ('costar', 'research', 'CoStar', 'https://www.costar.com/', 'Comps, availabilities, and ownership.', 'Use your research seat.', 'search', 10),
  ('crexi', 'research', 'Crexi', 'https://www.crexi.com/', 'Listings and offering memoranda.', 'Saved searches use your login.', 'building', 20),
  ('loopnet', 'research', 'LoopNet', 'https://www.loopnet.com/', 'Marketing exposure and listing search.', 'Broker account.', 'globe', 30),
  ('compstak', 'research', 'CompStak', 'https://compstak.com/', 'Crowdsourced lease comps.', 'Office login.', 'chart', 40),
  ('dealdesk', 'deals', 'Deal Desk', '/deals', 'Vouchers, backup files, and the packet accounting needs.', 'Opens in Lee Hub.', 'briefcase', 5),
  ('buildout', 'deals', 'Buildout', 'https://www.buildout.com/', 'Listing marketing and flyers.', 'Use your Buildout seat.', 'pen', 10),
  ('docusign', 'deals', 'DocuSign', 'https://www.docusign.com/', 'Leases, LOIs, and commission agreements.', 'Sign in with your work email.', 'signature', 20),
  ('apto', 'deals', 'Apto', 'https://www.apto.com/', 'Pipeline and deal CRM.', 'Office login.', 'briefcase', 30),
  ('clientlook', 'deals', 'ClientLook', 'https://www.clientlook.com/', 'Contacts, call lists, and follow-ups.', 'Use your Lee email.', 'users', 40),
  ('m365', 'workplace', 'Microsoft 365', 'https://www.office.com/', 'Mail, files, and the office apps.', 'Sign in with your Lee email.', 'mail', 10),
  ('outlook', 'workplace', 'Outlook', 'https://outlook.office.com/mail/', 'Inbox and shared mailboxes.', 'Work email.', 'mail', 20),
  ('teams', 'workplace', 'Teams', 'https://teams.microsoft.com/', 'Meetings, chats, and channels.', 'Work email.', 'video', 30),
  ('calendar', 'workplace', 'Calendar', 'https://outlook.office.com/calendar/', 'The office calendar.', 'Work email.', 'calendar', 40),
  ('lee', 'firm', 'Lee & Associates', 'https://www.lee-associates.com/', 'National site, brand, and office finder.', 'Public site.', 'landmark', 10),
  ('adp', 'firm', 'ADP', 'https://workforcenow.adp.com/', 'Pay, time, and benefits.', 'Registration code from HR.', 'calculator', 20),
  ('zoom', 'firm', 'Zoom', 'https://zoom.us/', 'Client calls outside Teams.', 'SSO with your work email.', 'video', 30)
on conflict (id) do nothing;
