https://github.com/coreyhaines31/marketingskills
https://github.com/coreyhaines31/marketingskills

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
1. Di Topic Library ini view nya bisa dalam calender atau table. [o]
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


== 23 Apr 2026

I would like to build a new featured:

"Create a new Feature for an AI-powered TikTok competitor analysis and script generation tool. The app will scrape viral competitor videos, analyze them, and generate new, tailored video concepts.

Environment: Use a .env file to store API keys.

Required External APIs (Implement integrations for these):

Apify API: To scrape TikTok profiles and pull their most recent/viral videos (specifically fetching video metadata, views, and video URLs).

Google Gemini API (Google AI Studio): To analyze the visual and audio elements of the scraped videos (understanding hooks, retention mechanisms, and content).

Let say we have a menu which is named Competitor Analyzer, in that menu or page we have:

1. Creators Tab (Competitor Database):

A form to add a new competitor by inputting their TikTok URL, Username, and Niche.

A dashboard displaying a grid/list of saved creators, showing their username, niche, follower count, and a preview profile image.

2. Configs Tab (Brand & Output Settings):

A form to create new analysis configurations.

Fields should include: Config Name, Target Niche/Category, Brand Context (who we are, what we sell), Analysis Instructions (e.g., "analyze the hook, retention mechanisms, and CTA"), and Output Preferences (e.g., "Generate 3 different script concepts with B-roll descriptions").

Save and display a list of created configurations.

3. Run Pipeline Tab (Execution & Results):

A settings panel to execute a job. It should have dropdowns/inputs to: Select a Config, specify how many recent videos to pull per creator (e.g., top 3 out of the last 20), and set a timeframe limit (e.g., only videos from the last 30 days).

A "Run Pipeline" button.

Results Display Area: Once the pipeline finishes, display the scraped videos alongside their AI analysis. Show the video thumbnail/link, why the video went viral (Gemini's analysis of the hook/retention).

Core Backend Logic Flow for the Pipeline:

Retrieve the list of creators linked to the selected config's niche.

Trigger Apify to scrape the selected creators' profiles for videos matching the timeframe and view-count parameters.

Send the top viral videos to the Gemini API with instructions to analyze the video/audio for hooks and retention strategies.

Pass Gemini's analysis, along with the specific rules from the user's Config (brand constraints, script format).

----

bun run scripts/create-user.ts kiranainternflo@gmail.com secret123 "Kirana"
bun run scripts/create-user.ts vita@floothink.com secret123 "Vita"
bun run scripts/create-user.ts amelia@floothink.com secret123 "Amelia"
bun run scripts/create-user.ts johan@floothink.com secret123 "Johan"
bun run scripts/create-user.ts fatur@floothink.com secret123 "Fatur"

bun run scripts/assign-user-to-project.ts kiranainternflo@gmail.com Floothink First
bun run scripts/assign-user-to-project.ts vita@floothink.com Floothink First
bun run scripts/assign-user-to-project.ts amelia@floothink.com Floothink First
bun run scripts/assign-user-to-project.ts johan@floothink.com Floothink First
bun run scripts/assign-user-to-project.ts fatur@floothink.com Floothink First 
bun run scripts/assign-user-to-project.ts iqbal@floothink.com Floothink First 

bun run scripts/assign-user-to-project.ts alice@floothink.com Floothink First --approver


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

# EMAIL Configuration
EMAIL_HOST=in-v3.mailjet.com
EMAIL_USER=2b3c637897e41d4236d4c979d6571935
EMAIL_PASS=d7991150259ae45a846035d07fe77c6a
EMAIL_PORT=587
EMAIL_SENDER=norepy-smm@floothink.com

dicoba pake ini mas


== 23 April 2026 - Discussion
1. Email often error, ga ngirim email nya -> better ganti pake gmail klo gtu deh. [done]
2. Brands are not filtered by project. [done]
3. One project is only one brands. [done]
4. Topic library default calender di bawah table nya.
5. Campaign Generator -> Chatbot. 
6. Double Check ke Competitor Analyzer pake skills UI/UX
7. satu user create workspace di limit, ini harus configurable di db. [done]
8. yang create project cuman superdamin doang. 
9. Skills ini dibuat global. tapi butuh mappingan-nya. [done]
10. Campaign -> input nya output butuh struktur nya mau gmana ? disabled dulu
11. Learning Center -> disabled dulu [done]
12. Research Hub -> disabled dulu.  [done]
13. Create baby step for tutorial [in progress]
14. timestamp seems like not valid. [done]
15. Pindahin workspace nya brand-brand ke project. check chat nya adam di Group RND [done]
16. Mapping skils-nya. [done]
17. Issue di advance mode, strategy controls. 
    ini gmana sih rules nya >.< ga ngerti. 

== 24 Apr 2026 - Tutor anak content:

1. intinya sih bikin default-nya language nya di Brain. di Product, Topic, Content generator itu ga usah pilih.

idealnya ngikut brand brain dulu sih mas, nanti kalau mau dirubah baru dipilih, biar ngurang2in input aja. tapi sementara gini dulu gpp 

==

1. language in brand brain only
2. marketing skills in global and mapped by system
3. 1 project = 1 brand
4. baby step for tutorial for new user

== 29 Apr 2026
1. mandatory project sebelum bikin brand. [done]
1.1 delete project it should be in Trash tab. [done]
2. klo ada pdf di download. [opsional]
3. untuk video content creator di preview nya di biat carousel gerak otomatis [done]
4. opsi language di content dan topic itu default nya aja ikut di brand brain [done]
5. abis create project, ga harus refresh untuk nampilin nya. [done]
6. setiap lagi generate mestinya ada opsi untuk bisa stop. [done]
7. ada alert dulu klo ada pindah page pas baru aja generate sesuatu. [done]
8. BUG: ga bisa create proudct klo lebih dari satu.  [done]
9. BUG: kenapa ga lengkap scrape awal, mestinya lsg lengkap aja. [done]
10. LEARNING: 
11. Brand Brain learning terus, update dari report nya. 
    - harus ada report nya dulu. -> metric cool API. 
12. Advanced mode need to be doubled check. 


== 
1. mandatory project sebelum bikin brand. [done]
1.1 delete project it should be in Trash tab. [done]
2. untuk video content creator di preview nya di biat carousel gerak otomatis [done]
3. opsi language di content dan topic itu default nya aja ikut di brand brain [done]
4. abis create project, ga harus refresh untuk nampilin nya. [done]
5. setiap lagi generate mestinya ada opsi untuk bisa stop. [done]
6. ada alert dulu klo ada pindah page pas baru aja generate sesuatu. [done]
7. BUG: ga bisa create proudct klo lebih dari satu.  [done]
8. BUG: kenapa ga lengkap scrape awal, mestinya lsg lengkap aja. [done]

== BUGS
1. ini email kadang suka ga ke kirim. [done]
2. orang udah click verificationn link tetep ga bisa login. [done]

== enhance
1. update project
2. set role member in workspace