// مواضيع الدعم: المفتاح بيتخزن في قاعدة البيانات، والباقي للعرض
export const TOPICS = [
  { k: 'bug', icon: '🐞', label: 'مشكلة في المنصة', hint: 'اوصف المشكلة: إيه اللي حصل؟ وكنت في أنهي صفحة؟ لو تقدر ابعت صورة للشاشة.' },
  { k: 'account', icon: '👤', label: 'مشكلة في حسابي', hint: 'احكيلنا إيه المشكلة في حسابك (دخول، صورة، اسم...).' },
  { k: 'suggestion', icon: '💡', label: 'اقتراح أو فكرة', hint: 'اكتب اقتراحك، وأي فكرة تخلّي المنصة أحسن.' },
  { k: 'question', icon: '❓', label: 'استفسار أو سؤال', hint: 'اكتب سؤالك وهنرد عليك في أقرب وقت.' },
  { k: 'report', icon: '🚩', label: 'بلاغ عن مستخدم أو محتوى', hint: 'اكتب اسم الشخص أو رابط الصفحة، وإيه اللي حصل.' },
  { k: 'premium', icon: '⭐', label: 'الباقة المميزة', hint: 'اسألنا عن الباقة المميزة وطريقة الاشتراك.' },
  { k: 'other', icon: '💬', label: 'موضوع آخر', hint: 'اكتب رسالتك لفريق جمعتنا.' },
] as const
export type TopicKey = (typeof TOPICS)[number]['k']
export const topicOf = (k?: string | null) => TOPICS.find((t) => t.k === k)

// مواضيع صفحة الدعم (طلبات الترقية ليها صفحة ومحادثة لوحدها)
export const SUPPORT_TOPICS = TOPICS.filter((t) => t.k !== 'premium')
export type Channel = 'support' | 'upgrade'
