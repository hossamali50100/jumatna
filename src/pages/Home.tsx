import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, errMsg, isPremium, type Post } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import PostCard from '../components/PostCard'
import { Err } from '../components/ui'

export const POST_SELECT = 'id,group_id,author_id,body,image_url,created_at,profiles(name,avatar_url,plan,plan_until),groups(name),likes(count),comments(count)'

export async function likedSet(ids: string[], uid: string) {
  if (!ids.length) return new Set<string>()
  const { data } = await supabase.from('likes').select('post_id').eq('user_id', uid).in('post_id', ids)
  return new Set((data ?? []).map((r) => r.post_id as string))
}

export default function Home() {
  const { session, profile } = useAuth()
  const uid = session!.user.id
  const [posts, setPosts] = useState<Post[] | null>(null)
  const [liked, setLiked] = useState<Set<string>>(new Set())
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    const { data: ms, error: e1 } = await supabase.from('group_members').select('group_id').eq('user_id', uid).eq('status', 'active')
    if (e1) return setErr(errMsg(e1))
    const ids = (ms ?? []).map((m) => m.group_id as string)
    if (!ids.length) return setPosts([])
    const { data, error } = await supabase.from('posts').select(POST_SELECT).in('group_id', ids).order('created_at', { ascending: false }).limit(30)
    if (error) return setErr(errMsg(error))
    const list = (data as unknown as Post[]) ?? []
    setLiked(await likedSet(list.map((p) => p.id), uid)); setPosts(list)
  }, [uid])
  useEffect(() => { load() }, [load])

  return (
    <div className="col">
      <Err>{err}</Err>
      {!isPremium(profile) && (
        <Link to="/plans" className="card row" style={{ background: '#111', color: '#fff' }}>
          <span className="grow"><b>قم بترقية حسابك</b><div style={{ fontSize: 13, color: '#B8B8BE' }}>أنشئ حتى 10 مجموعات واحصل على علامة التوثيق الخضراء</div></span>
          <span>←</span>
        </Link>
      )}
      {posts === null && !err && <div className="mut">جاري التحميل…</div>}
      {posts?.length === 0 && (
        <div className="card col" style={{ alignItems: 'center', textAlign: 'center' }}>
          <b>لسه مفيش بوستات</b><span className="mut">انضم لمجموعات عشان تظهرلك بوستاتها هنا.</span>
          <Link className="btn p" to="/discover">اكتشف المجموعات</Link>
        </div>
      )}
      {posts?.map((p) => <PostCard key={p.id} post={p} liked={liked.has(p.id)} onDeleted={(id) => setPosts((l) => l!.filter((x) => x.id !== id))} />)}
    </div>
  )
}
