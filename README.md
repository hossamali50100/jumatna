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
