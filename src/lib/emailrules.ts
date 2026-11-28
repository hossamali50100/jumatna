// التسجيل بالإيميل مسموح بس بإيميلات Gmail و Yahoo (عشان نقلل الإيميلات الوهمية اللي بترجع)
// لازم القايمة دي تفضل زي اللي في تحديث 059 (allowed_signup_domain)
export const ALLOWED_DOMAINS = ['gmail.com', 'googlemail.com', 'yahoo.com', 'ymail.com']

// غلطات كتابة مشهورة
const TYPOS: Record<string, string> = {
  'gmial.com': 'gmail.com', 'gmal.com': 'gmail.com', 'gmaill.com': 'gmail.com', 'gamil.com': 'gmail.com', 'gnail.com': 'gmail.com',
  'gmail.co': 'gmail.com', 'gmail.con': 'gmail.com', 'gmail.cm': 'gmail.com', 'gmail.om': 'gmail.com', 'gmail.comm': 'gmail.com', 'gmai.com': 'gmail.com', 'gmail.c': 'gmail.com', 'gmailcom': 'gmail.com',
  'yaho.com': 'yahoo.com', 'yahooo.com': 'yahoo.com', 'yahoo.con': 'yahoo.com', 'yahoo.co': 'yahoo.com', 'yhoo.com': 'yahoo.com', 'yahho.com': 'yahoo.com', 'yahoo.cm': 'yahoo.com',
}

/** بيرجع رسالة خطأ لو الإيميل مش مسموح، أو null لو تمام */
export function signupEmailError(raw: string): string | null {
  const email = raw.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'اكتب إيميل صحيح.'
  const [user, domain] = email.split('@')
  if (TYPOS[domain]) return `تقصد ${user}@${TYPOS[domain]}؟ الإيميل اللي كتبته فيه غلطة.`
  if (!ALLOWED_DOMAINS.includes(domain)) return 'التسجيل متاح بإيميل Gmail أو Yahoo بس. أو سجّل بزرار Google تحت.'
  return null
}
