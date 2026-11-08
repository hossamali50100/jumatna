import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, errMsg, type Post } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Avatar, Name, Err, timeAgo } from './ui'

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
  const [reported, setReported] = useState(false)

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
    if (!confirm('حذف البوست نهائيًا؟')) return
    const { error } = await supabase.from('posts').delete().eq('id', post.id)
    if (error) return setErr(errMsg(error))
    onDeleted(post.id)
  }

  const report = async () => {
    const reason = prompt('سبب البلاغ؟')?.trim()
    if (!reason || reason.length < 2) return
    const { error } = await supabase.from('reports').insert({ reporter_id: me, post_id: post.id, reason: reason.slice(0, 500) })
    if (error) setErr(errMsg(error)); else setReported(true)
  }

  return (
    <article className="card post col" style={{ gap: 8 }}>
      <div className="row">
        <Avatar name={post.profiles?.name} url={post.profiles?.avatar_url} />
        <div className="grow">
          <Name p={post.profiles} />
          <div className="mut"><Link to={`/g/${post.group_id}`}>{post.groups?.name}</Link> · {timeAgo(post.created_at)}</div>
        </div>
        {(post.author_id === me || canModerate || (profile && profile.role !== 'user')) && <button className="btn sm danger" onClick={delPost}>حذف</button>}
        {post.author_id !== me && !reported && <button className="btn sm" onClick={report}>إبلاغ</button>}
        {reported && <span className="mut">تم الإبلاغ</span>}
      </div>
      <div className="body">{post.body}</div>
      {post.image_url && <img className="pi" src={post.image_url} alt="" loading="lazy" />}
      <div className="row" style={{ borderTop: '1px solid var(--line)', paddingTop: 8 }}>
        <button className="btn sm" onClick={toggleLike} style={isLiked ? { background: '#111', color: '#fff' } : undefined}>{isLiked ? '♥' : '♡'} {likes}</button>
        <button className="btn sm" onClick={toggleComments}>💬 {ccount}</button>
      </div>
      <Err>{err}</Err>
      {open && (
        <div className="col" style={{ gap: 8 }}>
          {cms.map((c) => (
            <div key={c.id} className="row" style={{ alignItems: 'flex-start' }}>
              <Avatar name={c.profiles?.name} url={c.profiles?.avatar_url} size={32} />
              <div className="grow" style={{ background: '#F3F3F4', borderRadius: 12, padding: '8px 12px' }}>
                <Name p={c.profiles} /><div className="body">{c.body}</div>
                <div className="mut">{timeAgo(c.created_at)}{(c.author_id === me || canModerate) && <> · <button style={{ background: 'none', border: 0, color: 'var(--err)', cursor: 'pointer', padding: 0 }} onClick={() => delComment(c.id)}>حذف</button></>}</div>
              </div>
            </div>
          ))}
          <div className="row">
            <input className="in" placeholder="اكتب تعليق…" value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} />
            <button className="btn p" disabled={busy || !text.trim()} onClick={send}>إرسال</button>
          </div>
        </div>
      )}
    </article>
  )
}
