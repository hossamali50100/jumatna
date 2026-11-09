import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, errMsg, isPremium, uploadImage, type Post } from '../lib/supabase'
import PostCard from '../components/PostCard'
import Composer from '../components/Composer'
import { POST_SELECT, likedSet } from './Home'
import { useAuth } from '../lib/auth'
import { Avatar, Check, Err } from '../lib/ui'

export default function Profile() {
  const { session, profile, refresh, signOut } = useAuth()
  const [name, setName] = useState(profile?.name ?? '')
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')
  const [busy, setBusy] = useState(false)
  const [posts, setPosts] = useState<Post[] | null>(null)
  const [liked, setLiked] = useState<Set<string>>(new Set())
  const uid = session?.user.id
  const loadPosts = useCallback(async () => {
    if (!uid) return
    const { data, error } = await supabase.from('posts').select(POST_SELECT).eq('author_id', uid).is('group_id', null).order('created_at', { ascending: false }).limit(30)
    if (error) return setErr(errMsg(error))
    const list = (data ?? []) as unknown as Post[]
    setPosts(list); setLiked(await likedSet(list.map((p) => p.id), uid))
  }, [uid])
  useEffect(() => { loadPosts() }, [loadPosts])
  if (!profile) return null
  const prem = isPremium(profile)

  const save = async (patch: { name?: string; avatar_url?: string }) => {
    setErr(''); setOk(''); setBusy(true)
    const { error } = await supabase.from('profiles').update(patch).eq('id', profile.id)
    setBusy(false)
    if (error) return setErr(errMsg(error))
    setOk('تم الحفظ.'); refresh()
  }
  const pick = async (f?: File | null) => {
    if (!f) return
    try { await save({ avatar_url: await uploadImage(f, session!.user.id) }) } catch (e) { setErr(errMsg(e)) }
  }

  return (
    <div className="col">
      <div className="card col" style={{ alignItems: 'center', textAlign: 'center' }}>
        <Avatar name={profile.name} url={profile.avatar_url} size={84} />
        <div className="row" style={{ gap: 6 }}>{prem && <Check />}<b style={{ fontSize: 20 }}>{profile.name}</b></div>
        <span className="mut" dir="ltr">{session?.user.email}</span>
        <span className="pill">{prem ? `حساب مميز${profile.plan_until ? ' حتى ' + new Date(profile.plan_until).toLocaleDateString('ar-EG') : ''}` : 'حساب مجاني'}</span>
        {!prem && <Link className="btn p sm" to="/plans">ترقية الحساب</Link>}
      </div>
      <div className="card col">
        <b>تعديل البيانات</b>
        <input className="in" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        <label className="btn" style={{ cursor: 'pointer' }}>تغيير الصورة<input type="file" hidden accept="image/jpeg,image/png,image/webp,image/gif" onChange={(e) => pick(e.target.files?.[0])} /></label>
        <Err>{err}</Err>{ok && <div className="okmsg">{ok}</div>}
        <button className="btn p" disabled={busy || name.trim().length < 1 || name.trim() === profile.name} onClick={() => save({ name: name.trim() })}>حفظ الاسم</button>
      </div>
      <b style={{ padding: '0 4px' }}>منشوراتي الشخصية</b>
      <Composer groups={[]} allowPersonal onPosted={loadPosts} />
      {posts?.length === 0 && <div className="card mut" style={{ textAlign: 'center' }}>لسه ما نشرتش حاجة على صفحتك.</div>}
      {posts?.map((p) => <PostCard key={p.id} post={p} liked={liked.has(p.id)} onDeleted={(id) => setPosts((l) => l!.filter((x) => x.id !== id))} />)}
      <button className="btn line danger" onClick={signOut}>تسجيل الخروج</button>
    </div>
  )
}
