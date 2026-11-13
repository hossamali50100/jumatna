import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

type Line = { ok: boolean | null; t: string }

// صفحة فحص "متصل/غير متصل": بتعرض اللي بيحصل فعلًا مع السيرفر خطوة بخطوة (افتحها من /presence-test)
export default function PresenceTest() {
  const { session } = useAuth()
  const uid = session?.user.id
  const [lines, setLines] = useState<Line[]>([])
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!uid) return
    let live = true
    ;(async () => {
      const L: Line[] = []
      const add = (ok: boolean | null, t: string) => L.push({ ok, t })
      add(null, 'حسابك: ' + uid)
      const h = await supabase.rpc('heartbeat')
      add(!h.error, h.error ? 'النبضة (heartbeat) فشلت: ' + h.error.message : 'النبضة اتسجلت على السيرفر')
      const me = await supabase.from('presence').select('last_seen').eq('user_id', uid).maybeSingle()
      add(!me.error && !!me.data, me.error ? 'قراية صفّك فشلت: ' + me.error.message : me.data ? 'صفّك في جدول الحضور: آخر ظهور ' + me.data.last_seen : 'مفيش صف ليك في جدول الحضور')
      const fr = await supabase.from('friendships').select('requester_id,addressee_id').eq('status', 'accepted').or(`requester_id.eq.${uid},addressee_id.eq.${uid}`)
      const ids = (fr.data ?? []).map((r) => (r.requester_id === uid ? r.addressee_id : r.requester_id) as string)
      add(!fr.error, fr.error ? 'قراية الأصدقاء فشلت: ' + fr.error.message : 'عدد أصدقائك المقبولين: ' + ids.length)
      const of = await supabase.rpc('online_friends')
      const on = ((of.data ?? []) as unknown as string[]).map(String)
      add(!of.error, of.error ? 'دالة الأصدقاء المتصلين فشلت: ' + of.error.message : 'الأصدقاء المتصلين حسب السيرفر: ' + on.length)
      if (ids.length) {
        const pr = await supabase.from('profiles').select('id,name').in('id', ids)
        const pres = await supabase.from('presence').select('user_id,last_seen').in('user_id', ids)
        const name = (id: string) => pr.data?.find((p) => p.id === id)?.name ?? id.slice(0, 8)
        ids.forEach((id) => {
          const row = pres.data?.find((p) => p.user_id === id)
          add(on.includes(id), `${name(id)}: ${on.includes(id) ? 'متصل ✔' : 'غير متصل'} — ${row ? 'آخر نبضة ' + row.last_seen : pres.error ? 'مقدرتش أقرا جدول الحضور (' + pres.error.message + ')' : 'مفيش نبضة مسجلة ليه خالص'}`)
        })
      }
      if (live) setLines(L)
    })()
    return () => { live = false }
  }, [uid, n])
  return (
    <div style={{ width: '100%', maxWidth: 640, margin: '0 auto' }}>
      <div className="crd col">
        <b style={{ fontSize: 22 }}>فحص حالة الاتصال</b>
        <span className="mut">افتح الصفحة دي على جهازك وعلى جهاز صديقك (في نفس الوقت)، وابعتلي صورة من الاتنين.</span>
        {lines.map((l, i) => <div key={i} style={{ color: l.ok === false ? '#C0392B' : l.ok ? '#1E8E3E' : undefined, wordBreak: 'break-all' }}>{l.ok === false ? '✖ ' : l.ok ? '✔ ' : '• '}{l.t}</div>)}
        <button className="btn" onClick={() => setN(n + 1)}>تحديث</button>
      </div>
    </div>
  )
}
