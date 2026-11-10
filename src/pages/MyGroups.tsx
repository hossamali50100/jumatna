import { Link } from 'react-router-dom'
import { useMyGroups } from '../lib/groups'
import { Avatar, useIsMobile } from '../lib/ui'

const ROLE: Record<string, string> = { owner: 'مالك', admin: 'مشرف', member: 'عضو' }

export default function MyGroups() {
  const groups = useMyGroups()
  const mobile = useIsMobile()
  return (
    <>
      <div className="row"><h1 className="grow" style={{ margin: 0, fontSize: 26 }}>مجموعاتي</h1>{mobile && <Link className="btn p sm" to="/create">+ إنشاء مجموعة</Link>}</div>
      {groups.length === 0 && <div className="crd col" style={{ alignItems: 'center', textAlign: 'center', padding: 32 }}><b>لسه مفيش مجموعات</b><Link className="btn p" to="/discover">اكتشف المجموعات</Link></div>}
      {groups.map((g) => (
        <Link key={g.id} to={`/g/${g.id}`} className="crd row" style={{ gap: 12 }}>
          <Avatar name={g.name} url={g.cover_url} size={52} square />
          <div className="grow"><b>{g.name}</b><div className="mut">{g.myStatus === 'pending' ? 'بانتظار الموافقة' : ROLE[g.myRole]} · {g.privacy === 'public' ? 'عامة' : 'خاصة'}</div></div>
        </Link>
      ))}
    </>
  )
}
