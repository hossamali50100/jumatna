import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { Post } from '../lib/supabase'
import PostCard from '../components/PostCard'
import { POST_SELECT, likedSet } from './Home'

// صفحة بوست واحد (بتتفتح من الإشعارات) والتعليقات مفتوحة
export default function PostView() {
  const { id } = useParams()
  const { session } = useAuth()
  const [post, setPost] = useState<Post | null>(null)
  const [liked, setLiked] = useState(false)
  const [state, setState] = useState<'load' | 'ok' | 'gone'>('load')
  useEffect(() => {
    let live = true
    ;(async () => {
      const { data } = (await supabase.from('posts').select(POST_SELECT).eq('id', id!).maybeSingle()) as unknown as { data: Post | null }
      if (!live) return
      if (!data) return setState('gone')
      setPost(data); setLiked((await likedSet([data.id], session!.user.id)).has(data.id)); setState('ok')
    })()
    return () => { live = false }
  }, [id, session])
  return (
    <div style={{ width: '100%', maxWidth: 640, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {state === 'load' && <div className="mut">جاري التحميل…</div>}
      {state === 'gone' && <div className="crd col"><b>المنشور ده مش موجود أو اتحذف.</b><Link className="btn" to="/">الرئيسية</Link></div>}
      {state === 'ok' && post && <PostCard post={post} liked={liked} autoOpen onDeleted={() => setState('gone')} />}
    </div>
  )
}
