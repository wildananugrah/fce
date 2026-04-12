https://github.com/coreyhaines31/marketingskills/tree/main

https://fce-dashboard-six.vercel.app/

- adam@floothink.com
- Adam@fce!2026

```sql
select id, email, full_name from users;
select id, name from workspaces;

-- Wildan Anugrah -  7072fc25-d7bb-4753-a763-ff8ea2a356d8
-- BCA - fe73b5d4-3b99-4195-81c8-6973145ebb3f
-- Floothink - bb95075b-e090-49fa-85e2-b07cc2d45ed9

select * from user_workspace_roles;

select 
    u.email, 
    u.full_name,
    w.name,
    uw.role
from user_workspace_roles uw
join users u on u.id = uw.user_id 
join workspaces w on w.id = uw.workspace_id;

```

