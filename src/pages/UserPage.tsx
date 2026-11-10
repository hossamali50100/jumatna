import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase, errMsg, isPremium, uploadImage, type Group, type Post, type Profile } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useFriends, type PubProfile } from '../lib/friends'
import PostCard from '../components/PostCard'
import Composer from '../components/Composer'
import { Avatar, Check, Err, Icon, Name, gcolor, useIsMobile } from '../lib/ui'
import { POST_SELECT, likedSet } from './Home'
import { useChatDock } from '../components/ChatDock'

type FriendRow = { requester_id: string; addressee_id: string; req: PubProfile | null; adr: PubProfile | null }
type GM = { groups: Pick<Group, 'id' | 'name' | 'cover_url' | 'privacy'> | null }
type Tab = 'posts' | 'about' | 'friends' | 'groups'

export default function UserPage() {
  const { id } = useParams()
  const { session, profile: me, refresh } = useAuth()
  const uid = session!.user.id
  const pid = id ?? uid
  const mine = pid === uid
  const { rels, error: friendErr, request, accept, remove } = useFriends()
  const [p, setP] = useState<Profile | null>(null)
  const [missing, setMissing] = useState(false)
  const [tab, setTab] = useState<Tab>('posts')
  const [posts, setPosts] = useState<Post[] | null>(null)
  const [liked, setLiked] = useState<Set<string>>(new Set())
  const [friends, setFriends] = useState<{ id: string; profile: PubProfile | null }[]>([])
  const [groups, setGroups] = useState<GM['groups'][]>([])
  const [err, setErr] = useState('')
  const mobile = useIsMobile()
  const { openChat } = useChatDock()

  useEffect(() => { setTab('posts'); setP(null); setMissing(false); setPosts(null) }, [pid])

  const loadProfile = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('*').eq('id', pid).maybeSingle()
    if (!data) return setMissing(true)
    setP(data as Profile)
  }, [pid])
  useEffect(() => { loadProfile() }, [loadProfile])

  const loadPosts = useCallback(async () => {
    const { data, error } = await supabase.from('posts').select(POST_SELECT).eq('author_id', pid).order('created_at', { ascending: false }).limit(30)
    if (error) return setErr(errMsg(error))
    const list = (data ?? []) as unknown as Post[]
    setPosts(list); setLiked(await likedSet(list.map((x) => x.id), uid))
  }, [pid, uid])
  useEffect(() => { loadPosts() }, [loadPosts])

  useEffect(() => {
    supabase.from('friendships')
      .select('requester_id,addressee_id,req:profiles!requester_id(name,avatar_url,plan,plan_until),adr:profiles!addressee_id(name,avatar_url,plan,plan_until)')
      .eq('status', 'accepted').or(`requester_id.eq.${pid},addressee_id.eq.${pid}`)
      .then(({ data }) => setFriends(((data ?? []) as unknown as FriendRow[]).map((r) => r.requester_id === pid ? { id: r.addressee_id, profile: r.adr } : { id: r.requester_id, profile: r.req })))
    supabase.from('group_members').select('groups!group_id(id,name,cover_url,privacy)').eq('user_id', pid).eq('status', 'active')
      .then(({ data }) => setGroups(((data ?? []) as unknown as GM[]).map((x) => x.groups).filter((g) => g && (g.privacy === 'public' || mine))))
  }, [pid, mine])

  if (missing) return <div className="crd">الصفحة دي غير موجودة.</div>
  if (!p) return <div className="mut" style={{ textAlign: 'center' }}>جاري التحميل…</div>
  const prem = isPremium(p)
  const rel = rels.find((r) => r.other === pid)

  const save = async (patch: Partial<Pick<Profile, 'name' | 'bio' | 'avatar_url' | 'cover_url'>>) => {
    setErr('')
    const { error } = await supabase.from('profiles').update(patch).eq('id', uid)
    if (error) return setErr(errMsg(error))
    await loadProfile(); refresh()
  }
  const pickImg = async (f: File | null | undefined, key: 'avatar_url' | 'cover_url') => {
    if (!f) return
    try { await save({ [key]: await uploadImage(f, uid) }) } catch (e) { setErr(errMsg(e)) }
  }

  return (
    <>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ height: mobile ? 170 : 330, position: 'relative', background: p.cover_url ? `center/cover url("${p.cover_url}")` : `linear-gradient(135deg, ${gcolor(p.name)}, #111111)` }}>
          {mine && (
            <label className="btn sm" style={{ position: 'absolute', insetInlineEnd: 12, bottom: 12, cursor: 'pointer' }}><Icon n="image" s={18} />تغيير الغلاف
              <input type="file" hidden accept="image/jpeg,image/png,image/webp,image/gif" onChange={(e) => pickImg(e.target.files?.[0], 'cover_url')} />
            </label>
          )}
        </div>
        <div style={{ padding: mobile ? '0 14px 12px' : '0 32px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="row" style={{ alignItems: 'flex-end', gap: mobile ? 12 : 20, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', marginTop: mobile ? -50 : -84, border: '5px solid #fff', borderRadius: '50%', background: '#fff' }}>
              <Avatar name={p.name} url={p.avatar_url} size={mobile ? 100 : 168} />
              {mine && (
                <label aria-label="تغيير الصورة" style={{ position: 'absolute', insetInlineEnd: 0, bottom: 4, width: 36, height: 36, borderRadius: '50%', background: '#EFEFF1', border: '2px solid #fff', display: 'grid', placeItems: 'center', cursor: 'pointer' }}><Icon n="image" s={18} />
                  <input type="file" hidden accept="image/jpeg,image/png,image/webp,image/gif" onChange={(e) => pickImg(e.target.files?.[0], 'avatar_url')} />
                </label>
              )}
            </div>
            <div className="grow" style={{ lineHeight: 1.5, paddingBottom: 8 }}>
              <div className="row" style={{ gap: 6 }}>{prem && <Check />}<b style={{ fontSize: mobile ? 24 : 34 }}>{p.name}</b></div>
              <div className="mut">{friends.length} صديق · {groups.length} مجموعة</div>
            </div>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              {mine ? (<>
                <Link className="btn p" to="/profile/edit">تعديل الملف الشخصي</Link>
                {!prem && <Link className="btn" to="/plans">ترقية الحساب</Link>}
              </>) : (<>
                {mobile
                  ? <Link className="btn" to={`/messages/${pid}`}><Icon n="msg" s={18} />إرسال رسالة</Link>
                  : <button className="btn" onClick={() => openChat(pid)}><Icon n="msg" s={18} />إرسال رسالة</button>}
                {!rel && <button className="btn p" onClick={() => request(pid)}><Icon n="friends" s={18} />إضافة صديق</button>}
                {rel?.status === 'accepted' && <button className="btn" onClick={() => confirm('حذف الصداقة؟') && remove(pid)}>✓ أصدقاء</button>}
                {rel?.status === 'pending' && !rel.incoming && <button className="btn" onClick={() => remove(pid)}>إلغاء طلب الصداقة</button>}
                {rel?.status === 'pending' && rel.incoming && <button className="btn p" onClick={() => accept(pid)}>قبول طلب الصداقة</button>}
              </>)}
            </div>
          </div>
          {p.bio && <div className="body" style={{ fontSize: 15 }}>{p.bio}</div>}
        </div>
        <div className="row" style={{ borderTop: '1px solid #E4E4E7', padding: '0 12px', gap: 4, overflowX: 'auto' }}>
          {([['posts', 'المنشورات'], ['about', 'نبذة'], ['friends', 'الأصدقاء'], ['groups', 'المجموعات']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} style={{ fontFamily: 'inherit', background: 'none', border: 0, borderBottom: `3px solid ${tab === k ? '#111111' : 'transparent'}`, padding: '14px 16px', fontWeight: tab === k ? 700 : 500, color: tab === k ? '#111111' : '#55555C', fontSize: 15, cursor: 'pointer', whiteSpace: 'nowrap' }}>{l}</button>
          ))}
        </div>
      </div>
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Err>{err || friendErr}</Err>

      {tab === 'posts' && (
        <div className="pgrid">
          <aside className="col pside" style={{ gap: 16 }}>
            <div className="crd col" style={{ gap: 10 }}>
              <b style={{ fontSize: 18 }}>نبذة شخصية</b>
              {p.bio ? <div className="body">{p.bio}</div> : <span className="mut">{mine ? 'أضف نبذة عنك من "تعديل الملف الشخصي".' : 'لم يضف نبذة بعد.'}</span>}
            </div>
          </aside>
          <div className="col" style={{ gap: 16, minWidth: 0 }}>
            <>
            {mine && <Composer groups={[]} allowPersonal onPosted={loadPosts} />}
            {posts?.length === 0 && <div className="crd mut" style={{ textAlign: 'center' }}>{mine ? 'لسه ما نشرتش حاجة.' : 'مفيش منشورات تقدر تشوفها.'}</div>}
            {posts?.map((x) => <PostCard key={x.id} post={x} liked={liked.has(x.id)} canModerate={me?.role === 'admin'} onDeleted={(i) => setPosts((l) => l!.filter((y) => y.id !== i))} />)}
            </>
          </div>
        </div>
      )}
      {tab !== 'posts' && <div style={{ width: '100%', maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {tab === 'about' && (
        <div className="crd col">
          <b>نبذة</b>
          <div className="body">{p.bio || <span className="mut">مفيش نبذة لسه.</span>}</div>
          {p.created_at && <div className="mut">انضم في {new Date(p.created_at).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long' })}</div>}
          <div className="mut">{prem ? 'حساب مميز' : 'حساب مجاني'}</div>
        </div>
      )}
      {tab === 'friends' && (
        <div className="crd col">
          <b>الأصدقاء ({friends.length})</b>
          {friends.length === 0 && <span className="mut">مفيش أصدقاء لسه.</span>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 10 }}>
            {friends.map((f) => (
              <Link key={f.id} to={`/u/${f.id}`} className="row" style={{ border: '1px solid #E4E4E7', borderRadius: 12, padding: 10 }}><Avatar name={f.profile?.name} url={f.profile?.avatar_url} size={48} /><Name p={f.profile} /></Link>
            ))}
          </div>
        </div>
      )}
      {tab === 'groups' && (
        <div className="crd col">
          <b>المجموعات ({groups.length})</b>
          {groups.length === 0 && <span className="mut">مفيش مجموعات لسه.</span>}
          {groups.map((g) => g && (
            <Link key={g.id} to={`/g/${g.id}`} className="row"><Avatar name={g.name} url={g.cover_url} size={48} square /><b>{g.name}</b></Link>
          ))}
        </div>
      )}
      </div>}
      </div>
    </>
  )
}
