import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import SupportThread from '../components/SupportThread'

export default function Support() {
  const { session } = useAuth()
  return (
    <div style={{ width: '100%', maxWidth: 640, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="crd col">
        <div className="row"><b className="grow" style={{ fontSize: 20 }}>فريق جمعتنا</b><Link className="btn sm" to="/plans">الباقة المميزة</Link></div>
        <SupportThread userId={session!.user.id} />
      </div>
    </div>
  )
}
