// شاشة المكالمة: الرنة، الفيديو، الأزرار، والشات جنب المكالمة
import { useEffect, useRef, useState } from 'react'
import { useCall, type CallKind, type Peer } from '../lib/call'
import { Avatar } from '../lib/ui'
import DmThread from './DmThread'

const I = ({ d, s = 24 }: { d: React.ReactNode; s?: number }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{d}</svg>
export const IcoVideo = ({ s = 22 }: { s?: number }) => <I s={s} d={<><rect x="2" y="6" width="14" height="12" rx="2.5" /><path d="M16 10.5l5-3v9l-5-3" /></>} />
export const IcoPhone = ({ s = 22 }: { s?: number }) => <I s={s} d={<path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.2 2 2 0 014.1 2h3a2 2 0 012 1.7c.1.9.4 1.8.7 2.7a2 2 0 01-.5 2.1L8 9.8a16 16 0 006 6l1.3-1.3a2 2 0 012.1-.4c.9.3 1.8.6 2.7.7a2 2 0 011.7 2z" />} />
const IcoHang = () => <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden style={{ transform: 'rotate(135deg)' }}><path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.2 2 2 0 014.1 2h3a2 2 0 012 1.7c.1.9.4 1.8.7 2.7a2 2 0 01-.5 2.1L8 9.8a16 16 0 006 6l1.3-1.3a2 2 0 012.1-.4c.9.3 1.8.6 2.7.7a2 2 0 011.7 2z" /></svg>
const IcoMic = ({ off }: { off: boolean }) => <I d={<><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0014 0M12 17v4M8 21h8" />{off && <path d="M3 3l18 18" />}</>} />
const IcoCam = ({ off }: { off: boolean }) => <I d={<><rect x="2" y="6" width="14" height="12" rx="2.5" /><path d="M16 10.5l5-3v9l-5-3" />{off && <path d="M2 2l20 20" />}</>} />
const IcoChat = () => <I d={<path d="M21 12a8 8 0 01-11.5 7.2L4 21l1.8-5.5A8 8 0 1121 12z" />} />
const IcoFlip = () => <I d={<><path d="M20 7h-3.5l-2-3h-5l-2 3H4a2 2 0 00-2 2v9a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z" /><path d="M9 13.5a3 3 0 015.2-2M15 13.5a3 3 0 01-5.2 2" /></>} />

const mmss = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` }

function Video({ stream, muted, mirror, className }: { stream: MediaStream | null; muted?: boolean; mirror?: boolean; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const v = ref.current; if (!v) return
    if (v.srcObject !== stream) v.srcObject = stream
    if (stream) v.play().catch(() => {})
  }, [stream])
  return <video ref={ref} className={className} autoPlay playsInline muted={muted} style={mirror ? { transform: 'scaleX(-1)' } : undefined} />
}

/** زراير الاتصال اللي فوق المحادثة الخاصة */
export function CallButtons({ peer, size = 'md' }: { peer: Peer | null; size?: 'sm' | 'md' }) {
  const c = useCall()
  if (!c || !peer) return null
  const go = (k: CallKind) => (e: React.MouseEvent) => { e.stopPropagation(); e.preventDefault(); c.start(peer, k) }
  const cls = size === 'sm' ? 'cm-tb call-b' : 'call-btn'
  return (
    <span className="row" style={{ gap: size === 'sm' ? 2 : 4, flex: 'none' }}>
      <button type="button" className={cls} onClick={go('audio')} aria-label="مكالمة صوتية" title="مكالمة صوتية"><IcoPhone s={size === 'sm' ? 18 : 22} /></button>
      <button type="button" className={cls} onClick={go('video')} aria-label="مكالمة فيديو" title="مكالمة فيديو"><IcoVideo s={size === 'sm' ? 20 : 24} /></button>
    </span>
  )
}

export default function CallScreen() {
  const c = useCall()
  const [chat, setChat] = useState(false)
  const [now, setNow] = useState(Date.now())
  const call = c?.call
  useEffect(() => { if (call?.phase !== 'live') return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [call?.phase])
  useEffect(() => { if (!call) setChat(false) }, [call])
  useEffect(() => {
    if (!call || call.phase === 'ended') return
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && chat) setChat(false) }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [call, chat])
  if (!c || !call) return null
  const { peer, phase, kind } = call
  const kindTxt = kind === 'video' ? 'مكالمة فيديو' : 'مكالمة صوتية'

  if (phase === 'incoming') {
    return (
      <div className="call-ring" role="dialog" aria-modal="true" aria-label={'مكالمة جاية من ' + peer.name}>
        <div className="call-ring-card">
          <div className="call-pulse"><Avatar name={peer.name} url={peer.avatar_url} size={96} /></div>
          <b style={{ fontSize: 22 }}>{peer.name}</b>
          <span className="mut">{kind === 'video' ? 'بيكلمك فيديو…' : 'بيكلمك…'}</span>
          <div className="row" style={{ gap: 48, marginTop: 18, justifyContent: 'center' }}>
            <span className="col" style={{ alignItems: 'center', gap: 6 }}><button type="button" className="call-round red" onClick={c.decline} aria-label="رفض"><IcoHang /></button><small>رفض</small></span>
            <span className="col" style={{ alignItems: 'center', gap: 6 }}><button type="button" className="call-round green" onClick={c.accept} aria-label="رد" autoFocus>{kind === 'video' ? <IcoVideo s={28} /> : <IcoPhone s={26} />}</button><small>رد</small></span>
          </div>
        </div>
      </div>
    )
  }

  const live = phase === 'live'
  const showRemoteVideo = kind === 'video' && live && !!c.remote?.getVideoTracks().length && !c.peerCamOff
  const status = phase === 'outgoing' ? (call.id ? 'بيرن…' : 'بيتصل…')
    : phase === 'connecting' ? 'جاري التوصيل…'
    : phase === 'ended' ? (call.endText ?? 'انتهت المكالمة.')
    : mmss(now - (call.since ?? now))

  return (
    <div className={'call-ov' + (chat ? ' with-chat' : '')} role="dialog" aria-modal="true" aria-label={kindTxt + ' مع ' + peer.name}>
      <div className="call-stage">
        {/* صوت وصورة الطرف التاني (الفيديو بيشغّل الصوت حتى في المكالمة الصوتية) */}
        <Video stream={c.remote} className={'call-remote' + (showRemoteVideo ? '' : ' hide')} />
        {!showRemoteVideo && (
          <div className="call-center">
            <Avatar name={peer.name} url={peer.avatar_url} size={120} />
            <b style={{ fontSize: 24 }}>{peer.name}</b>
            <span className="call-status">{status}</span>
            {live && kind === 'video' && c.peerCamOff && <span className="call-chip">الكاميرا مقفولة عنده</span>}
          </div>
        )}
        {showRemoteVideo && <div className="call-top"><b>{peer.name}</b><span>{status}</span></div>}
        {live && c.peerMicOff && <span className="call-chip call-chip-top">🔇 {peer.name} قافل المايك</span>}
        {kind === 'video' && c.local && phase !== 'ended' && (
          <div className="call-self">{c.camOff ? <div className="call-self-off"><IcoCam off /></div> : <Video stream={c.local} muted mirror />}</div>
        )}
        {phase !== 'ended' && (
          <div className="call-bar">
            <button type="button" className={'call-ctl' + (c.micOff ? ' on' : '')} onClick={c.toggleMic} aria-pressed={c.micOff} aria-label={c.micOff ? 'تشغيل المايك' : 'كتم المايك'} title={c.micOff ? 'تشغيل المايك' : 'كتم المايك'} disabled={!c.local}><IcoMic off={c.micOff} /></button>
            {kind === 'video' && <button type="button" className={'call-ctl' + (c.camOff ? ' on' : '')} onClick={c.toggleCam} aria-pressed={c.camOff} aria-label={c.camOff ? 'تشغيل الكاميرا' : 'قفل الكاميرا'} title={c.camOff ? 'تشغيل الكاميرا' : 'قفل الكاميرا'} disabled={!c.local?.getVideoTracks().length}><IcoCam off={c.camOff} /></button>}
            {kind === 'video' && c.canFlip && <button type="button" className="call-ctl" onClick={c.flip} aria-label="قلب الكاميرا" title="قلب الكاميرا"><IcoFlip /></button>}
            <button type="button" className={'call-ctl' + (chat ? ' on' : '')} onClick={() => setChat((v) => !v)} aria-pressed={chat} aria-label="الشات" title="الشات"><IcoChat /></button>
            <button type="button" className="call-round red" onClick={c.hangup} aria-label="إنهاء المكالمة" title="إنهاء المكالمة"><IcoHang /></button>
          </div>
        )}
        {phase === 'ended' && <div className="call-bar"><button type="button" className="btn" onClick={c.hangup}>إغلاق</button></div>}
      </div>
      {chat && (
        <aside className="call-chat" aria-label={'الشات مع ' + peer.name}>
          <div className="row" style={{ padding: '10px 12px', borderBottom: '1px solid #E4E4E7', gap: 8 }}>
            <b className="grow">الشات مع {peer.name}</b>
            <button type="button" className="cm-tb" onClick={() => setChat(false)} aria-label="قفل الشات">✕</button>
          </div>
          <div style={{ flex: 1, minHeight: 0, padding: '0 8px 8px' }}><DmThread otherId={peer.id} fill /></div>
        </aside>
      )}
    </div>
  )
}
