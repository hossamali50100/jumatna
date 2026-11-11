import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { supabase, uploadImage, errMsg } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useFriends } from '../lib/friends'
import { refreshRooms, type RoomInfo } from '../lib/rooms'
import { Avatar, Err, Name } from '../lib/ui'

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return createPortal(
    <div className="fw-ov" onClick={onClose}>
      <div className="fw" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="fw-h"><span>{title}</span><button className="btn sm" onClick={onClose} aria-label="إغلاق">✕</button></div>
        {children}
      </div>
    </div>, document.body)
}
const hint = (m: string) => (/create_chat_room|add_room_members|update_chat_room|leave_chat_room|schema cache|chat_room/i.test(m) && !/[؀-ۿ]/.test(m)) ? 'مجموعات الشات محتاجة تحديث 031 في Supabase (مرة واحدة).' : m

function Picker({ exclude, sel, setSel }: { exclude?: Set<string>; sel: Set<string>; setSel: (s: Set<string>) => void }) {
  const { rels } = useFriends()
  const [q, setQ] = useState('')
  const list = rels.filter((r) => r.status === 'accepted' && !exclude?.has(r.other) && (!q.trim() || (r.profile?.name ?? '').toLowerCase().includes(q.trim().toLowerCase())))
  return (<>
    <div style={{ padding: '8px 14px 0' }}><input className="in" placeholder="ابحث في أصدقائك" value={q} onChange={(e) => setQ(e.target.value)} /></div>
    <div className="fw-l" style={{ maxHeight: 260 }}>
      {list.length === 0 && <div className="mut" style={{ textAlign: 'center', padding: 18 }}>مفيش أصدقاء متاحين.</div>}
      {list.map((r) => (
        <label key={r.other} className="fw-r" style={{ cursor: 'pointer' }}>
          <Avatar name={r.profile?.name} url={r.profile?.avatar_url} size={40} /><div className="grow"><Name p={r.profile} /></div>
          <input type="checkbox" checked={sel.has(r.other)} onChange={() => { const n = new Set(sel); if (n.has(r.other)) n.delete(r.other); else n.add(r.other); setSel(n) }} style={{ width: 20, height: 20 }} />
        </label>
      ))}
    </div>
  </>)
}

function AvatarPick({ file, setFile, current, name }: { file: File | null; setFile: (f: File | null) => void; current?: string | null; name: string }) {
  const inp = useRef<HTMLInputElement>(null)
  const url = file ? URL.createObjectURL(file) : current
  return (
    <div className="row" style={{ gap: 12 }}>
      <button type="button" onClick={() => inp.current?.click()} style={{ border: 0, background: 'none', cursor: 'pointer', padding: 0 }} aria-label="اختيار صورة"><Avatar name={name || 'م'} url={url} size={64} /></button>
      <button type="button" className="btn sm" onClick={() => inp.current?.click()}>{url ? 'تغيير الصورة' : 'إضافة صورة'}</button>
      <input ref={inp} type="file" accept="image/*" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
    </div>
  )
}

// إنشاء مجموعة شات جديدة
export function NewRoomModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { session } = useAuth(); const uid = session!.user.id
  const [name, setName] = useState(''); const [file, setFile] = useState<File | null>(null); const [sel, setSel] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  const create = async () => {
    setBusy(true); setErr('')
    try {
      const avatar = file ? await uploadImage(file, uid) : null
      const { data, error } = await supabase.rpc('create_chat_room', { p_name: name.trim(), p_avatar: avatar, p_members: [...sel] })
      if (error) throw error
      refreshRooms(); onCreated('room:' + (data as string)); onClose()
    } catch (e) { setErr(hint(errMsg(e))) }
    setBusy(false)
  }
  return (
    <Modal title="دردشة جماعية جديدة" onClose={onClose}>
      <div className="col" style={{ padding: '12px 14px 0', gap: 10 }}>
        <AvatarPick file={file} setFile={setFile} name={name} />
        <input className="in" placeholder="اسم المجموعة" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
        <span className="mut" style={{ fontSize: 13 }}>اختار صديقين على الأقل ({sel.size} مختار)</span>
      </div>
      <Picker sel={sel} setSel={setSel} />
      <div style={{ padding: 14 }} className="col"><Err>{err}</Err><button className="btn p" disabled={busy || !name.trim() || sel.size < 2} onClick={create}>{busy ? 'استنى…' : 'إنشاء المجموعة'}</button></div>
    </Modal>
  )
}

// تغيير اسم وصورة المجموعة
export function EditRoomModal({ room, onClose }: { room: RoomInfo; onClose: () => void }) {
  const { session } = useAuth(); const uid = session!.user.id
  const [name, setName] = useState(room.name); const [file, setFile] = useState<File | null>(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  const save = async () => {
    setBusy(true); setErr('')
    try {
      const avatar = file ? await uploadImage(file, uid) : null
      const { error } = await supabase.rpc('update_chat_room', { p_room: room.id, p_name: name.trim(), p_avatar: avatar })
      if (error) throw error
      refreshRooms(); onClose()
    } catch (e) { setErr(hint(errMsg(e))) }
    setBusy(false)
  }
  return (
    <Modal title="تعديل المجموعة" onClose={onClose}>
      <div className="col" style={{ padding: 14, gap: 12 }}>
        <AvatarPick file={file} setFile={setFile} current={room.avatar_url} name={name} />
        <input className="in" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
        <Err>{err}</Err>
        <button className="btn p" disabled={busy || !name.trim()} onClick={save}>{busy ? 'استنى…' : 'حفظ'}</button>
      </div>
    </Modal>
  )
}

// إضافة أعضاء
export function AddMembersModal({ room, onClose }: { room: RoomInfo; onClose: () => void }) {
  const [sel, setSel] = useState<Set<string>>(new Set()); const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  const add = async () => {
    setBusy(true); setErr('')
    const { error } = await supabase.rpc('add_room_members', { p_room: room.id, p_members: [...sel] })
    setBusy(false)
    if (error) return setErr(hint(errMsg(error)))
    refreshRooms(); onClose()
  }
  return (
    <Modal title="إضافة أعضاء" onClose={onClose}>
      <Picker exclude={new Set(room.members.map((m) => m.user_id))} sel={sel} setSel={setSel} />
      <div style={{ padding: 14 }} className="col"><Err>{err}</Err><button className="btn p" disabled={busy || sel.size === 0} onClick={add}>{busy ? 'استنى…' : `إضافة (${sel.size})`}</button></div>
    </Modal>
  )
}

// قايمة الأعضاء (اللي أنشأ المجموعة بس يقدر يطرد)
export function MembersModal({ room, onClose }: { room: RoomInfo; onClose: () => void }) {
  const { session } = useAuth(); const uid = session!.user.id
  const canKick = room.created_by === uid
  const [err, setErr] = useState('')
  const kick = async (id: string, name?: string) => {
    if (!confirm(`تطرد ${name ?? 'العضو ده'} من المجموعة؟`)) return
    const { error } = await supabase.rpc('remove_room_member', { p_room: room.id, p_user: id })
    if (error) return setErr(/remove_room_member|schema cache/i.test(error.message) ? 'الطرد محتاج تحديث 032 في Supabase (مرة واحدة).' : errMsg(error))
    refreshRooms()
  }
  return (
    <Modal title={`الأعضاء (${room.members.length})`} onClose={onClose}>
      <div style={{ padding: '0 14px' }}><Err>{err}</Err></div>
      <div className="fw-l">
        {room.members.map((m) => (
          <div key={m.user_id} className="fw-r">
            <Link to={`/u/${m.user_id}`} onClick={onClose} className="row grow" style={{ gap: 10 }}><Avatar name={m.profiles?.name} url={m.profiles?.avatar_url} size={40} /><div className="grow"><Name p={m.profiles} />{m.user_id === room.created_by && <span className="mut" style={{ fontSize: 12 }}> · منشئ المجموعة</span>}</div></Link>
            {canKick && m.user_id !== uid && <button className="btn sm" style={{ color: '#B91C1C' }} onClick={() => kick(m.user_id, m.profiles?.name)}>طرد</button>}
          </div>
        ))}
      </div>
    </Modal>
  )
}
