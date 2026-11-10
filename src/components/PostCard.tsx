import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, errMsg, type Post } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Avatar, Err, Icon, Name, timeAgo } from '../lib/ui'

type Cm = { id: string; body: string; created_at: string; author_id: string; parent_id: string | null; comment_likes?: { count: number }[]; profiles: { name: string; avatar_url: string | null; plan: 'free' | 'premium'; plan_until: string | null } | null }

export default function PostCard({ post, liked, canModerate, hideGroup, onDeleted }: { post: Post; liked: boolean; canModerate?: boolean; hideGroup?: boolean; onDeleted: (id: string) => void }) {
  const { session, profile } = useAuth()
  const me = session!.user.id
  const [isLiked, setLiked] = useState(liked)
  const [likes, setLikes] = useState(post.likes?.[0]?.count ?? 0)
  const [ccount, setCcount] = useState(post.comments?.[0]?.count ?? 0)
  const [open, setOpen] = useState(false)
  const [cms, setCms] = useState<Cm[]>([])
  const [cLiked, setCLiked] = useState<Set<string>>(new Set())
  const [cCount, setCCount] = useState<Record<string, number>>({})
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null)
  const [rtext, setRtext] = useState('')
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
      .select('id,body,created_at,author_id,parent_id,comment_likes(count),profiles!author_id(name,avatar_url,plan,plan_until)')
      .eq('post_id', post.id).order('created_at').limit(300)
    if (error) return setErr(errMsg(error))
    const list = (data as unknown as Cm[]) ?? []
    setCms(list)
    setCCount(Object.fromEntries(list.map((c) => [c.id, c.comment_likes?.[0]?.count ?? 0])))
    if (list.length) {
      const { data: mine } = await supabase.from('comment_likes').select('comment_id').eq('user_id', me).in('comment_id', list.map((c) => c.id))
      setCLiked(new Set(((mine ?? []) as { comment_id: string }[]).map((x) => x.comment_id)))
    }
  }
  const toggleCLike = async (id: string) => {
    const was = cLiked.has(id)
    setCLiked((x) => { const n = new Set(x); if (was) n.delete(id); else n.add(id); return n })
    setCCount((m) => ({ ...m, [id]: Math.max(0, (m[id] ?? 0) + (was ? -1 : 1)) }))
    const { error } = was
      ? await supabase.from('comment_likes').delete().eq('comment_id', id).eq('user_id', me)
      : await supabase.from('comment_likes').insert({ comment_id: id, user_id: me })
    if (error) {
      setCLiked((x) => { const n = new Set(x); if (was) n.add(id); else n.delete(id); return n })
      setCCount((m) => ({ ...m, [id]: Math.max(0, (m[id] ?? 0) + (was ? 1 : -1)) }))
      setErr(errMsg(error))
    }
  }
  const sendReply = async () => {
    const body = rtext.trim()
    if (!body || !replyTo || busy) return
    setBusy(true); setErr('')
    const { error } = await supabase.from('comments').insert({ post_id: post.id, author_id: me, body, parent_id: replyTo.id })
    setBusy(false)
    if (error) return setErr(errMsg(error))
    setRtext(''); setReplyTo(null); setCcount((n) => n + 1); loadComments()
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
    const gone = cms.filter((c) => c.id === id || c.parent_id === id).length
    setCms((l) => l.filter((c) => c.id !== id && c.parent_id !== id)); setCcount((n) => Math.max(0, n - gone))
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
  const item = (c: Cm, isReply: boolean) => (
    <div className="row" style={{ alignItems: 'flex-start' }}>
      <Link to={`/u/${c.author_id}`}><Avatar name={c.profiles?.name} url={c.profiles?.avatar_url} size={isReply ? 30 : 36} /></Link>
      <div className="grow">
        <div style={{ background: '#EFEFF1', borderRadius: 16, padding: '8px 14px', fontSize: 15, display: 'inline-block', maxWidth: '100%' }}>
          <Link to={`/u/${c.author_id}`}><Name p={c.profiles} /></Link><div className="body">{c.body}</div>
        </div>
        <div className="mut row" style={{ padding: '2px 8px', gap: 12, fontSize: 13 }}>
          <span>{timeAgo(c.created_at)}</span>
          <button onClick={() => toggleCLike(c.id)} style={{ background: 'none', border: 0, cursor: 'pointer', padding: 0, font: 'inherit', fontWeight: cLiked.has(c.id) ? 700 : 500, color: cLiked.has(c.id) ? '#111111' : 'inherit' }}>{cLiked.has(c.id) ? 'أعجبك' : 'إعجاب'}</button>
          <button onClick={() => { setReplyTo({ id: c.parent_id ?? c.id, name: c.profiles?.name ?? '' }); setRtext(isReply ? `@${c.profiles?.name ?? ''} ` : '') }} style={{ background: 'none', border: 0, cursor: 'pointer', padding: 0, font: 'inherit', color: 'inherit' }}>رد</button>
          {(cCount[c.id] ?? 0) > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#111111' }}><Icon n="heart" s={14} on />{cCount[c.id]}</span>}
          {(c.author_id === me || canModerate || staff) && <button style={{ background: 'none', border: 0, color: '#C0392B', cursor: 'pointer', padding: 0, font: 'inherit' }} onClick={() => delComment(c.id)}>حذف</button>}
        </div>
      </div>
    </div>
  )

  return (
    <article className="crd">
      <div className="row">
        <Link to={`/u/${post.author_id}`} aria-label="الصفحة الشخصية"><Avatar name={post.profiles?.name} url={post.profiles?.avatar_url} size={44} /></Link>
        <div className="grow" style={{ lineHeight: 1.5 }}>
          {post.group_id && !hideGroup && <Link to={`/g/${post.group_id}`} className="mut" style={{ display: 'block', fontSize: 13 }}>{gname}</Link>}
          <Link to={`/u/${post.author_id}`}><Name p={post.profiles} /></Link>
          <div className="mut">{!post.group_id && 'منشور شخصي · '}{timeAgo(post.created_at)}</div>
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
          {cms.filter((c) => !c.parent_id).map((c) => (
            <div key={c.id} className="col" style={{ gap: 8 }}>
              {item(c, false)}
              {cms.filter((x) => x.parent_id === c.id).map((x) => <div key={x.id} style={{ marginInlineStart: 44 }}>{item(x, true)}</div>)}
              {replyTo && (replyTo.id === c.id) && (
                <div className="row" style={{ marginInlineStart: 44 }}>
                  <input autoFocus style={{ flex: 1, border: 0, background: '#EFEFF1', borderRadius: 24, padding: '10px 16px', minHeight: 42, outline: 'none' }} placeholder={`رد على ${replyTo.name}...`} aria-label="اكتب ردًا" value={rtext} maxLength={2000} onChange={(e) => setRtext(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') sendReply() }} />
                  <button className="btn p sm" disabled={busy || !rtext.trim()} onClick={sendReply}>إرسال</button>
                  <button className="btn sm" onClick={() => { setReplyTo(null); setRtext('') }}>إلغاء</button>
                </div>
              )}
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
