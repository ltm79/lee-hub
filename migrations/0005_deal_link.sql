insert into links (id, category_id, name, url, blurb, hint, icon, sort_order)
values (
  'dealdesk',
  'deals',
  'Deal Desk',
  '/deals',
  'Vouchers, backup files, and the packet accounting needs.',
  'Opens in Lee Hub.',
  'briefcase',
  5
)
on conflict (id) do nothing;
