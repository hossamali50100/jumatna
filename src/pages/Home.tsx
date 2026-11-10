import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, errMsg, type Post } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useMyGroups } from '../lib/groups'
import PostCard from '../components/PostCard'
import Composer from '../components/Composer'
import { Err } from '../lib/ui'

// profiles!author_id و groups!group_id: تحديد العلاقة صراحةً (من غيره PostgREST بيتلخبط لأن فيه أكتر من طريق)
export const POST_SELECT = 'id,group_id,author_id,body,image_url,created_at,profiles!author_id(name,avatar_url,plan,plan_until),groups!group_id(name,cover_url),likes(count),comments(count)'

export async function likedSet(ids: string[], uid: string) {
  if (!ids.length) return new Set<string>()
  const { data } = await supabase.from('likes').select('post_id').eq('user_id', uid).in('post_id', ids)
  return new Set((data ?? []).map((r) => r.post_id as string))
}

export default function Home() {
  const { session } = useAuth()
  const uid = session!.user.id
  const [tick, setTick] = useState(0)
  const mine = useMyGroups(tick).filter((g) => g.myStatus === 'active')
  const [posts, setPosts] = useState<Post[] | null>(null)
  const [liked, setLiked] = useState<Set<string>>(new Set())
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    const { data: ms, error: e1 } = await supabase.from('group_members').select('group_id').eq('user_id', uid).eq('status', 'active')
    if (e1) return setErr(errMsg(e1))
    const ids = (ms ?? []).map((m) => m.group_id as string)
    // بوستات مجموعاتي + بوستاتي الشخصية
    const parts = [`and(group_id.is.null,author_id.eq.${uid})`]
    if (ids.length) parts.unshift(`group_id.in.(${ids.join(',')})`)
    const { data, error } = await supabase.from('posts').select(POST_SELECT).or(parts.join(',')).order('created_at', { ascending: false }).limit(30)
    if (error) return setErr(errMsg(error))
    const list = (data as unknown as Post[]) ?? []
    setLiked(await likedSet(list.map((p) => p.id), uid)); setPosts(list)
  }, [uid])
  useEffect(() => { load() }, [load])

  return (
    <>
      <Err>{err}</Err>
      <Composer groups={mine} allowPersonal onPosted={() => { load(); setTick((t) => t + 1) }} />
      {posts === null && !err && <div className="mut" style={{ textAlign: 'center' }}>جاري التحميل…</div>}
      {posts?.length === 0 && (
        <div className="crd col" style={{ alignItems: 'center', textAlign: 'center', padding: 32 }}>
          <b>مفيش بوستات هنا</b><span className="mut" style={{ fontSize: 14 }}>انضم لمجموعات وبوستاتها هتظهر هنا.</span>
          <Link className="btn p" to="/discover">اكتشف المجموعات</Link>
        </div>
      )}
      {posts?.map((p) => <PostCard key={p.id} post={p} liked={liked.has(p.id)} onDeleted={(id) => setPosts((l) => l!.filter((x) => x.id !== id))} />)}
    </>
  )
}
