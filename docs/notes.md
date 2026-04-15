https://github.com/coreyhaines31/marketingskills/tree/main

https://fce-dashboard-six.vercel.app/

https://github.com/adamfloothink/fce-dashboard

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
Bugs:
1. Prompt kepanjangan jadi lemot perlu di adjust.
2. Pastikan pas topic generator dia ada isinya.
3. Re-generate masing topic itu mestinya bisa
4. Reference URL di topic generator -> ini mesti cek cara kerja nya di repo nya adam. -> ada output nya untuk jadi reference pas generate. 
5. Di bagian New Brand pass scraping website pastikan bisa ambil context dari website nya. Jangan tanya ke AI lagi. 
6. number of topics bisa star dari 1

Discussion:
1. Di Topic Library ini view nya bisa dalam calender atau table. 
2. Workspace untuk pembatas antara client-client yang lain. 
3. Beda workspace jangan beda skills, skills di buat untuk general. 
4. Context untuk pemahaman AI itu di level workspace. 
5. Obsidien pelajari
6. Pelajari prompt nya Adam. 
7. https://github.com/blader/humanizer
8. Settingan Skill nya harus di buat untuk all workspace -> klo bisa di set sama superadmin. 
9. Competitor di Brain Brands di bawah References. 
10. Get Image dari SEO nya si link, mestinya featured image. 
11. Mood Visual
12. Content generator pas yang video bikin visual scriptnya. 
13. Campaign generator kita memulai dari upload video lalu system dapat memahami nya dengan baik. -> topic dan sekelompok content. atau cobain dulu tambahin pake Skill -> skill campaign
14. Report -> menu sendiri. 
15. Research Hub -> pending.
16. Learning Center -> pending. 