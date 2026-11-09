import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, errMsg, type Post } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Avatar, Err, Icon, Name, timeAgo } from '../lib/ui'

type Cm = { id: string; body: string; created_at: string; author_id: string; profiles: { name: string; avatar_url: string | null; plan: 'free' | 'premium'; plan_until: string | null } | null }

export default function PostCard({ post, liked, canModerate, onDeleted }: { post: Post; liked: boolean; canModerate?: boolean; onDeleted: (id: string) => void }) {
  const { session, profile } = useAuth()
  const me = session!.user.id
  const [isLiked, setLiked] = useState(liked)
  const [likes, setLikes] = useState(post.likes?.[0]?.count ?? 0)
  const [ccount, setCcount] = useState(post.comments?.[0]?.count ?? 0)
  const [open, setOpen] = useState(false)
  const [cms, setCms] = useState<Cm[]>([])
  const [text, setText] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [menu, setMenu] = useState(false)
  const [reported, setReported] = useState(false)
  const mref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const f = (e: MouseEvent) => { if (mref.current && !mref.current.contains(e.target as Node)) setMenu(false) }
    document.addEventListener('mousedown', f); return () => document.removeEventListener('mousedown', f)
  }, [])
  const staff = !!profile && profile.role !== 'user'
  const canDelete = post.author_id === me || canModerate || staff

  const toggleLike = async () => {
    const was = isLiked
    setLiked(!was); setLikes((n) => n + (was ? -1 : 1))
    const { error } = was
      ? await supabase.from('likes').delete().eq('post_id', post.id).eq('user_id', me)
      : await supabase.from('likes').insert({ post_id: post.id, user_id: me })
    if (error) { setLiked(was); setLikes((n) => n + (was ? 1 : -1)); setErr(errMsg(error)) }
  }
  const loadComments = async () => {
    const { data, error } = await supabase.from('comments')
      .select('id,body,created_at,author_id,profiles(name,avatar_url,plan,plan_until)')
      .eq('post_id', post.id).order('created_at').limit(100)
    if (error) setErr(errMsg(error)); else setCms((data as unknown as Cm[]) ?? [])
  }
  const toggleComments = () => { const n = !open; setOpen(n); if (n) loadComments() }
  const send = async () => {
    const body = text.trim()
    if (!body || busy) return
    setBusy(true); setErr('')
    const { error } = await supabase.from('comments').insert({ post_id: post.id, author_id: me, body })
    setBusy(false)
    if (error) return setErr(errMsg(error))
    setText(''); setCcount((n) => n + 1); loadComments()
  }
  const delComment = async (id: string) => {
    const { error } = await supabase.from('comments').delete().eq('id', id)
    if (error) return setErr(errMsg(error))
    setCms((l) => l.filter((c) => c.id !== id)); setCcount((n) => Math.max(0, n - 1))
  }
  const delPost = async () => {
    setMenu(false)
    if (!confirm('حذف البوست نهائيًا؟')) return
    const { error } = await supabase.from('posts').delete().eq('id', post.id)
    if (error) return setErr(errMsg(error))
    onDeleted(post.id)
  }
  const report = async () => {
    setMenu(false)
    const reason = prompt('سبب البلاغ؟')?.trim()
    if (!reason || reason.length < 2) return
    const { error } = await supabase.from('reports').insert({ reporter_id: me, post_id: post.id, reason: reason.slice(0, 500) })
    if (error) setErr(errMsg(error)); else setReported(true)
  }
  const gname = post.groups?.name

  return (
    <article className="crd">
      <div className="row">
        <Link to={`/g/${post.group_id}`}><Avatar name={gname} size={44} square /></Link>
        <div className="grow" style={{ lineHeight: 1.5 }}>
          <Link to={`/g/${post.group_id}`}><b>{gname}</b></Link>
          <div className="mut"><Name p={post.profiles} /> · {timeAgo(post.created_at)}</div>
        </div>
        <div ref={mref} style={{ position: 'relative' }}>
          <button className="mi" aria-label="خيارات البوست" onClick={() => setMenu(!menu)}><Icon n="more" /></button>
          {menu && (
            <div className="pop" style={{ minWidth: 180, insetInlineStart: 0 }}>
              {post.author_id !== me && !reported && <button onClick={report}>إبلاغ عن البوست</button>}
              {reported && <span className="mut" style={{ padding: 10, display: 'block' }}>تم الإبلاغ</span>}
              {canDelete && <button onClick={delPost} style={{ color: '#C0392B' }}>حذف البوست</button>}
              {post.author_id === me && !canDelete && null}
            </div>
          )}
        </div>
      </div>
      <p className="body" style={{ margin: '10px 0' }}>{post.body}</p>
      {post.image_url && <img className="post-img" src={post.image_url} alt="" loading="lazy" />}
      <div className="mut" style={{ paddingBottom: 8, borderBottom: '1px solid #E4E4E7' }}>{likes} إعجاب · {ccount} تعليق</div>
      <div className="row" style={{ justifyContent: 'space-around', marginTop: 4 }}>
        <button className="btn ghost" style={isLiked ? { fontWeight: 700 } : undefined} onClick={toggleLike}>
          <Icon n="heart" s={20} />{isLiked ? 'أعجبك' : 'إعجاب'}
        </button>
        <button className="btn ghost" onClick={toggleComments}><Icon n="comment" s={20} />تعليق</button>
      </div>
      <Err>{err}</Err>
      {open && (
        <div className="col" style={{ gap: 10, marginTop: 8 }}>
          {cms.length === 0 && <div className="mut" style={{ textAlign: 'center' }}>كن أول من يعلّق.</div>}
          {cms.map((c) => (
            <div key={c.id} className="row" style={{ alignItems: 'flex-start' }}>
              <Avatar name={c.profiles?.name} url={c.profiles?.avatar_url} size={36} />
              <div className="grow">
                <div style={{ background: '#EFEFF1', borderRadius: 16, padding: '8px 14px', fontSize: 15 }}>
                  <Name p={c.profiles} /><div className="body">{c.body}</div>
                </div>
                <div className="mut" style={{ padding: '2px 8px' }}>{timeAgo(c.created_at)}
                  {(c.author_id === me || canModerate || staff) && <> · <button style={{ background: 'none', border: 0, color: '#C0392B', cursor: 'pointer', padding: 0, font: 'inherit' }} onClick={() => delComment(c.id)}>حذف</button></>}
                </div>
              </div>
            </div>
          ))}
          <div className="row">
            <input style={{ flex: 1, border: 0, background: '#EFEFF1', borderRadius: 24, padding: '12px 18px', minHeight: 48, outline: 'none' }} placeholder="اكتب تعليقًا..." aria-label="اكتب تعليقًا" value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} />
            <button className="btn p" disabled={busy || !text.trim()} onClick={send}>إرسال</button>
          </div>
        </div>
      )}
    </article>
  )
}
