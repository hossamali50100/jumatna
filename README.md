# جمعتنا — دليل التشغيل والرفع (خطوة بخطوة)

المشروع: React + Vite + Supabase. كل الصلاحيات والحماية في قاعدة البيانات (`supabase/schema.sql`).

## الخطوة 1 — Supabase (قاعدة البيانات)
1. ادخل supabase.com وسجّل بحساب جوجل، واضغط **New project**. اختار اسم وكلمة سر قوية للقاعدة (احفظها) وأقرب منطقة.
2. من القائمة: **SQL Editor** ← **New query** ← الصق محتوى ملف `supabase/schema.sql` كله ← **Run**. لازم تشوف "Success".
3. من **Project Settings ← API** انسخ: `Project URL` و `anon public key` (هتحتاجهم في الخطوة 3).

## الخطوة 2 — تسجيل الدخول بجوجل
1. في Google Cloud Console (console.cloud.google.com) اعمل مشروع ← **APIs & Services ← OAuth consent screen** (External) ← ثم **Credentials ← Create credentials ← OAuth client ID** (نوع Web application).
2. في **Authorized redirect URIs** حط الرابط اللي بيظهرلك في Supabase: **Authentication ← Providers ← Google** (شكله `https://xxxx.supabase.co/auth/v1/callback`).
3. انسخ Client ID و Client Secret وحطهم في صفحة Google provider في Supabase وفعّلها.
4. في Supabase: **Authentication ← URL Configuration** حط في Site URL رابط موقعك (بعد الخطوة 4)، وضيفه كمان في Redirect URLs. للتجربة المحلية ضيف `http://localhost:5173`.
5. **Authentication ← Providers ← Email**: سيب Confirm email مفعّل (يمنع الحسابات الوهمية).

## الخطوة 3 — GitHub
1. اعمل حساب على github.com ← **New repository** ← اسم `jumatna` ← **Private** ← Create.
2. اضغط **uploading an existing file** وافرد فولدر المشروع (بعد فك الـ ZIP) واسحب كل محتوياته. **متحطش** ملف `.env.local` أبدًا (مفتاحك السري).
3. اضغط **Commit changes**.

## الخطوة 4 — الرفع على Cloudflare Pages (مجاني)
1. dash.cloudflare.com ← **Workers & Pages ← Create ← Pages ← Connect to Git** ← اختار الريبو.
2. الإعدادات: Framework = **Vite** (أو Build command: `npm run build` — ولو الواجهة طلبت Deploy command سيبه `npx wrangler deploy`، وملف `wrangler.jsonc` موجود في المشروع).
3. في **Environment variables** ضيف: `VITE_SUPABASE_URL` و `VITE_SUPABASE_ANON_KEY` بقيمك من الخطوة 1.
4. **Save and Deploy**. هتاخد رابط `xxx.pages.dev`. لاحقًا اربط الدومين من **Custom domains**.
5. ارجع لـ Supabase ← URL Configuration وحط رابط الموقع الحقيقي.

## الخطوة 5 — خليك أنت الأدمن
سجّل دخول للموقع مرة بحسابك، وبعدين في Supabase ← SQL Editor شغّل:
```sql
update public.profiles set role = 'admin'
where id = (select id from auth.users where email = 'hossamali50100@gmail.com');
```
ولترقية مستخدم مميز لمدة شهر (بعد ما يدفع):
```sql
select admin_set_plan('USER-ID-HERE', 'premium', 30);
```

## التحديثات بعد كده
عدّل الملف على GitHub (أو ارفع نسخة جديدة) ← Cloudflare يعيد الرفع لوحده خلال دقيقة. الداتا ما بتتمسحش لأنها في Supabase. أي تعديل على الجداول بيتعمل بملف SQL جديد (migration) مش بإعادة تشغيل schema.sql.

## التشغيل على جهازك (اختياري)
```
npm install
cp .env.example .env.local   # واكتب قيمك
npm run dev
```

## الحماية الموجودة
- RLS على كل الجداول: مفيش حد يقرأ/يكتب حاجة مش من حقه (اتختبرت: `supabase/tests`).
- حد المجموعات (1 مجاني / 10 مميز) بيتفرض من السيرفر مش من الواجهة.
- المستخدم مينفعش يغيّر باقته أو صلاحيته أو الحظر بنفسه؛ ده من خلال دوال الأدمن فقط.
- المجموعات الخاصة بوستاتها مخفية عن غير الأعضاء، والانضمام بموافقة.
- حدود طول النصوص، وحد البوستات (20/ساعة) والتعليقات (60/ساعة) ضد السبام.
- الصور: JPG/PNG/WebP/GIF فقط وحد 5 ميجا، وكل مستخدم يرفع في فولدره بس.
- ترويسات أمان (CSP, HSTS, X-Frame-Options…) في `public/_headers`.
- React بيعمل escape للنصوص تلقائيًا (حماية XSS).

## لسه مش مبني (المراحل الجاية)
الشات (رسائل + صوت + صور)، شات الترقية مع فريق جمعتنا، لوحة الأدمن، الإشعارات، الأصدقاء.

---

## تحديث: المنشورات الشخصية (مهم — مرة واحدة)

لو الموقع شغال عندك قبل كده، لازم تشغّل ملف `supabase/migrations/002_personal_posts.sql` مرة واحدة:
Supabase ← SQL Editor ← New snippet ← الصق محتوى الملف ← Run.
المنشور الشخصي بيظهر لصاحبه وللإدارة بس حاليًا.

## تحديث: الأصدقاء ودعوات المجموعات (مرة واحدة)

شغّل ملف `supabase/migrations/003_friends_invites.sql` في Supabase ← SQL Editor ← New snippet ← الصق ← Run.
بعدها: صفحة الأصدقاء (بحث، طلب صداقة، قبول)، وزر "دعوة" جوه المجموعة بيدعو أصدقاءك، وزر "مشاركة" بينسخ الرابط.

## تحديث: الملف الشخصي (مرة واحدة)

شغّل `supabase/migrations/004_profiles.sql` في SQL Editor (بعد 002 و003). بيضيف النبذة وصورة الغلاف، ويخلي المنشورات الشخصية تظهر لأصدقاء صاحبها.
ملف `src/pages/Profile.tsx` القديم اتشال (اتحل محله `UserPage.tsx`): لو لسه موجود على GitHub امسحه.

## تحديث: حذف الحساب (مرة واحدة)

شغّل `supabase/migrations/005_delete_account.sql`. الحذف بيتم بعد 24 ساعة بجدولة على السيرفر (pg_cron). لو ظهرت ملاحظة "pg_cron مش متاحة": Database ← Extensions ← فعّل pg_cron ثم شغّل الملف تاني.

## تحديث: شات الدعم والترقية (مرة واحدة)

شغّل `supabase/migrations/006_support_chat.sql`. بعده زرار "تواصل مع فريق جمعتنا" في صفحة الباقات بيفتح محادثة (صفحة /support). الإدارة بترد من "صندوق الدعم" في قايمة الحساب (صفحة /staff/support)، وفيها زرار "تفعيل مميز 30 يوم" للأدمن.

## تحديث: الرسائل المباشرة (مرة واحدة)

شغّل `supabase/migrations/007_direct_messages.sql`. أي عضو يقدر يبعت رسالة لأي عضو (من غير صداقة) من زرار "إرسال رسالة" في صفحته. الرسائل خاصة بين الاتنين بس (حتى الإدارة ما تقراهاش).


**مواضيع الدعم (014):** شغّل `supabase/migrations/014_support_topics.sql` مرة واحدة. بيظهر كارد "الدعم" في العمود اليمين، والموضوع اللي اختاره العميل بيظهر لفريق الدعم في صندوق الدعم.

### تحديث 015 — لوحة الإدارة المنفصلة

### تحديث 016 — شاشة أول دخول

### تحديث 017 — فصل الترقية عن الدعم + مسح المحادثة

### تحديث 018 — محادثات دعم بجلسات

### تحديث 019 — الإشعارات

### تحديث 020 — إعدادات الملف الشخصي وحد تغيير الاسم
- شغّل `supabase/migrations/020_name_change_limit.sql` مرة واحدة: الاسم يتغيّر مرة كل 30 يوم (السيرفر هو اللي بيفرض ده). تاريخ الميلاد والجنس مش بيتغيّروا ومش بيظهروا في الإعدادات.
- شغّل `supabase/migrations/019_notifications.sql` مرة واحدة. بيعمل جدول الإشعارات ومحفّزات تلقائية: إعجاب/تعليق/رد على بوستك، إعجاب على تعليقك، طلب صداقة وقبوله، دعوة مجموعة، وطلب انضمام لمجموعتك.
- الجرس فيه عدّاد أحمر، وقايمة منسدلة بشكل فيسبوك، وصفحة `/notifications`، وكل إشعار بيفتح البوست `/post/:id` أو الصفحة المناسبة.
- شغّل `supabase/migrations/018_support_chat_sessions.sql` مرة واحدة (بعد 017). كل زيارة لصفحة الدعم/الترقية = محادثة جديدة، بتتقفل بزرار «إنهاء المحادثة» أو تلقائيًا بعد 30 دقيقة من آخر نشاط.
- القفل التلقائي بيتم لما أي صفحة دعم تتفتح (بدون pg_cron). ولو عايزه يشتغل من السيرفر برضو: `select cron.schedule('support-sweep','*/5 * * * *','update public.support_chats set status=''closed'', closed_by=''system'', closed_at=now() where status=''open'' and last_activity_at < now() - interval ''30 minutes''');`
- شغّل `supabase/migrations/017_support_channels.sql` مرة واحدة. بيضيف عمود `channel` (support / upgrade) ودالة مسح المحادثة.
- صفحة الدعم `/support` ومحادثة الترقية `/upgrade` منفصلتين، وفي لوحة الإدارة «صندوق الدعم» و«طلبات الترقية» منفصلين.
- شغّل `supabase/migrations/016_onboarding.sql` مرة واحدة. أي حساب جديد (جوجل أو إيميل) بيكمّل الاسم وتاريخ الميلاد والجنس قبل ما يدخل. الحسابات القديمة بتعدي من غير ما تتطلب.
- تاريخ الميلاد والجنس في جدول خاص `profile_private` (صاحبه والفريق بس).
- لو إنشاء الحساب بالإيميل مش شغال: غالبًا بسبب تأكيد الإيميل. من Supabase: Authentication → Sign In / Providers → Email → اقفل «Confirm email» (أو اربط SMTP زي Resend).
- شغّل `supabase/migrations/015_admin_dashboard.sql` مرة واحدة في SQL Editor (بيضيف جدول إعدادات المنصة + دالة تغيير الأدوار).
- اللوحة على الرابط `/admin` ولها بوابة دخول خاصة (إيميل وكلمة سر أو Google)، ومتاحة لأصحاب الأدوار أدمن/مشرف/دعم بس.

**الرد على التعليقات والإعجاب بها (013):** شغّل `supabase/migrations/013_comment_replies_likes.sql` مرة واحدة.

**متصل الآن (012):** شغّل `supabase/migrations/012_presence.sql` مرة واحدة. بيظهر نقطة خضراء على صورة الصديق المتصل (للأصدقاء فقط) في قايمة الدردشات وصفحة الرسائل والشات المصغر.

**إصلاح المنشور الشخصي (011):** لو ظهر "violates row-level security policy for table posts" وإنت بتنشر على صفحتك، شغّل `supabase/migrations/011_personal_post_insert_fix.sql` مرة واحدة (ماتشغّلش 002 تاني).

**قفل الحساب (010):** شغّل `supabase/migrations/010_locked_profile.sql` مرة واحدة. زرار القفل في صفحتك الشخصية بيخلّي الغريب يشوف الاسم والصورة والغلاف والنبذة بس، من غير أصدقاء ولا مجموعات ولا منشورات.

**إصلاح إنشاء مجموعة خاصة (009):** شغّل `supabase/migrations/009_private_group_create_fix.sql` مرة واحدة (كان إنشاء مجموعة "خاصة" بيطلّع خطأ "violates row-level security policy for table groups").
**تحديث الإشعارات (008):** شغّل `supabase/migrations/008_unread_messages.sql` مرة واحدة. بيظهر عدّاد أحمر على أيقونة الرسائل (رسائل جديدة) وعلى أيقونة الأصدقاء (طلبات صداقة ودعوات مجموعات)، ويتحدّث كل ~12 ثانية.
