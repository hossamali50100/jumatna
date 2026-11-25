// مكالمات الصوت والفيديو بين شخصين (WebRTC)
// الصوت والصورة بيروحوا مباشرة بين المتصفحين (أو عن طريق سيرفر TURN بتاع Cloudflare لو التوصيل المباشر مش نافع).
// Supabase بيستخدم بس عشان: مين بيتصل بمين (جدول calls) ورسايل التوصيل (جدول call_signals) — تحديث 056.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { supabase, errMsg } from './supabase'
import { useAuth } from './auth'
import { tell } from './dialog'

export type CallKind = 'video' | 'audio'
export type Peer = { id: string; name: string; avatar_url: string | null }
export type Phase = 'outgoing' | 'incoming' | 'connecting' | 'live' | 'ended'
type Row = { id: string; caller_id: string; callee_id: string; kind: CallKind; status: string; created_at: string }
type Sig = { id: number; sender_id: string; kind: 'offer' | 'answer' | 'ice'; payload: RTCSessionDescriptionInit & RTCIceCandidateInit }
export type CallState = { id: string; role: 'caller' | 'callee'; kind: CallKind; phase: Phase; peer: Peer; endText?: string; since?: number; relay?: boolean }

const RING_SECS = 45
const STUN: RTCIceServer[] = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }]
const FINAL = ['declined', 'missed', 'ended', 'canceled']

type Ctx = {
  call: CallState | null
  local: MediaStream | null
  remote: MediaStream | null
  micOff: boolean; camOff: boolean
  peerMicOff: boolean; peerCamOff: boolean
  canFlip: boolean
  start: (peer: Peer, kind: CallKind) => void
  accept: () => void
  decline: () => void
  hangup: () => void
  toggleMic: () => void
  toggleCam: () => void
  flip: () => void
}
const C = createContext<Ctx | null>(null)
export const useCall = () => useContext(C)

const friendly = (e: unknown) => {
  const m = errMsg(e)
  if (/start_call|answer_call|end_call|schema cache|calls|function/i.test(m) && !/call_not_allowed|callee_busy|too_many_calls/.test(m)) return 'المكالمات محتاجة تحديث 056 في Supabase (مرة واحدة).'
  if (/call_not_allowed/.test(m)) return 'تقدر تتصل بس بأصدقائك، أو بحد بينكم رسايل من الطرفين.'
  if (/callee_busy/.test(m)) return 'الشخص ده في مكالمة تانية دلوقتي. جرّب كمان شوية.'
  if (/too_many_calls/.test(m)) return 'عملت مكالمات كتير في وقت قصير. استنى شوية وجرّب تاني.'
  return m
}

async function getMedia(kind: CallKind): Promise<{ stream: MediaStream; noCam: boolean }> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('المتصفح ده مش بيدعم المكالمات. جرّب Chrome أو Safari حديث.')
  const audio = { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio, video: kind === 'video' ? { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } : false })
    return { stream, noCam: kind === 'video' && !stream.getVideoTracks().length }
  } catch (e) {
    const n = (e as DOMException)?.name
    if (kind === 'video' && (n === 'NotFoundError' || n === 'OverconstrainedError' || n === 'NotReadableError')) {
      // مفيش كاميرا (أو مشغولة): نكمل بالصوت بس
      try { return { stream: await navigator.mediaDevices.getUserMedia({ audio }), noCam: true } } catch { /* نكمل للرسالة تحت */ }
    }
    if (n === 'NotAllowedError' || n === 'SecurityError') throw new Error('لازم تسمح للموقع يستخدم ' + (kind === 'video' ? 'الكاميرا والمايك' : 'المايك') + '. دوس على علامة القفل جنب عنوان الموقع واسمح، وجرّب تاني.')
    if (n === 'NotFoundError') throw new Error('مش لاقي مايك على الجهاز ده.')
    if (n === 'NotReadableError') throw new Error('المايك أو الكاميرا مستخدمين في برنامج تاني. اقفله وجرّب تاني.')
    throw new Error('مش قادر أفتح ' + (kind === 'video' ? 'الكاميرا والمايك' : 'المايك') + '.')
  }
}

async function getIce(): Promise<{ servers: RTCIceServer[]; relay: boolean }> {
  try {
    const { data } = await supabase.auth.getSession()
    const r = await fetch('/api/ice', { method: 'POST', headers: { authorization: 'Bearer ' + (data.session?.access_token ?? '') } })
    if (!r.ok) throw new Error()
    const j = await r.json() as { iceServers?: RTCIceServer[]; turn?: boolean }
    return { servers: j.iceServers?.length ? j.iceServers : STUN, relay: !!j.turn }
  } catch { return { servers: STUN, relay: false } }
}

// نغمة الرنة (متصنّعة بالكود)
let actx: AudioContext | null = null
function tone(pattern: [number, number, number][], vol: number) {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    actx = actx ?? new AC()
    const c = actx
    if (c.state !== 'running') c.resume().catch(() => {})
    const t0 = c.currentTime + 0.03
    for (const [f, d, len] of pattern) {
      const o = c.createOscillator(); const g = c.createGain()
      o.type = 'sine'; o.frequency.value = f
      g.gain.setValueAtTime(0.0001, t0 + d)
      g.gain.exponentialRampToValueAtTime(vol, t0 + d + 0.03)
      g.gain.setValueAtTime(vol, t0 + d + len - 0.05)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + len)
      o.connect(g); g.connect(c.destination); o.start(t0 + d); o.stop(t0 + d + len + 0.02)
    }
  } catch { /* الصوت مش متاح */ }
}
const ringIn = () => { tone([[880, 0, 0.35], [660, 0.4, 0.35], [880, 0.8, 0.35], [660, 1.2, 0.35]], 0.35); navigator.vibrate?.([400, 200, 400]) }
const ringOut = () => tone([[440, 0, 1], [480, 0, 1]], 0.08)
const beepEnd = () => tone([[480, 0, 0.18], [380, 0.22, 0.25]], 0.25)

export function CallProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const uid = session?.user.id ?? ''
  const [call, setCall] = useState<CallState | null>(null)
  const [local, setLocal] = useState<MediaStream | null>(null)
  const [remote, setRemote] = useState<MediaStream | null>(null)
  const [micOff, setMicOff] = useState(false)
  const [camOff, setCamOff] = useState(false)
  const [peerMicOff, setPeerMicOff] = useState(false)
  const [peerCamOff, setPeerCamOff] = useState(false)
  const [canFlip, setCanFlip] = useState(false)

  const cur = useRef<CallState | null>(null)
  const pc = useRef<RTCPeerConnection | null>(null)
  const dc = useRef<RTCDataChannel | null>(null)
  const media = useRef<MediaStream | null>(null)
  const seen = useRef(new Set<number>())
  const lastSig = useRef(0)
  const pendingIce = useRef<RTCIceCandidateInit[]>([])
  const queue = useRef<Promise<void>>(Promise.resolve())
  const subs = useRef<ReturnType<typeof supabase.channel>[]>([])
  const timers = useRef<number[]>([])
  const ringT = useRef<number | null>(null)
  const facing = useRef<'user' | 'environment'>('user')
  const state = useRef({ mic: false, cam: false })

  const set = useCallback((s: CallState | null) => { cur.current = s; setCall(s) }, [])
  const patch = useCallback((p: Partial<CallState>) => { if (cur.current) set({ ...cur.current, ...p }) }, [set])

  const stopRing = () => { if (ringT.current) { clearInterval(ringT.current); ringT.current = null } }
  const startRing = (fn: () => void, every: number) => { stopRing(); fn(); ringT.current = window.setInterval(fn, every) }

  const cleanup = useCallback(() => {
    stopRing()
    timers.current.forEach((t) => clearTimeout(t)); timers.current = []
    subs.current.forEach((c) => supabase.removeChannel(c)); subs.current = []
    try { dc.current?.close() } catch { /* */ }
    try { pc.current?.close() } catch { /* */ }
    dc.current = null; pc.current = null
    media.current?.getTracks().forEach((t) => t.stop()); media.current = null
    seen.current = new Set(); lastSig.current = 0; pendingIce.current = []; queue.current = Promise.resolve()
    setLocal(null); setRemote(null); setMicOff(false); setCamOff(false); setPeerMicOff(false); setPeerCamOff(false)
    state.current = { mic: false, cam: false }
  }, [])

  const finish = useCallback((text: string | null) => {
    const was = cur.current
    cleanup()
    if (!was) return
    if (!text) { set(null); return }
    if (was.phase !== 'incoming') beepEnd()
    set({ ...was, phase: 'ended', endText: text })
    window.setTimeout(() => { if (cur.current?.id === was.id && cur.current.phase === 'ended') set(null) }, 2200)
  }, [cleanup, set])

  const sendState = () => { try { if (dc.current?.readyState === 'open') dc.current.send(JSON.stringify(state.current)) } catch { /* */ } }
  const bindDc = (ch: RTCDataChannel) => {
    dc.current = ch
    ch.onopen = sendState
    ch.onmessage = (e) => { try { const s = JSON.parse(e.data as string); setPeerMicOff(!!s.mic); setPeerCamOff(!!s.cam) } catch { /* */ } }
  }

  const sendSig = async (id: string, kind: Sig['kind'], payload: unknown) => {
    const { error } = await supabase.from('call_signals').insert({ call_id: id, kind, payload })
    if (error) console.warn('call signal', error.message)
  }

  const flushIce = async () => {
    const p = pc.current; if (!p?.remoteDescription) return
    const list = pendingIce.current; pendingIce.current = []
    for (const c of list) { try { await p.addIceCandidate(c) } catch { /* */ } }
  }

  const handleSig = useCallback((s: Sig) => {
    if (!s || s.sender_id === uid || seen.current.has(s.id)) return
    if (!pc.current) return // لسه مش جاهزين، هتتجاب تاني في السحب الجاي
    seen.current.add(s.id); lastSig.current = Math.max(lastSig.current, s.id)
    queue.current = queue.current.then(async () => {
      const p = pc.current; const c = cur.current
      if (!p || !c) return
      try {
        if (s.kind === 'offer' && c.role === 'callee') {
          await p.setRemoteDescription({ type: 'offer', sdp: s.payload.sdp })
          await flushIce()
          const ans = await p.createAnswer()
          await p.setLocalDescription(ans)
          await sendSig(c.id, 'answer', { type: ans.type, sdp: ans.sdp })
        } else if (s.kind === 'answer' && c.role === 'caller' && p.signalingState === 'have-local-offer') {
          await p.setRemoteDescription({ type: 'answer', sdp: s.payload.sdp })
          await flushIce()
        } else if (s.kind === 'ice') {
          if (p.remoteDescription) await p.addIceCandidate(s.payload).catch(() => {})
          else pendingIce.current.push(s.payload)
        }
      } catch (e) { console.warn('call sig', e) }
    })
  }, [uid])

  const pullSigs = useCallback(async (id: string) => {
    const { data } = await supabase.from('call_signals').select('id,sender_id,kind,payload').eq('call_id', id).gt('id', lastSig.current).order('id')
    ;(data as Sig[] | null)?.forEach(handleSig)
  }, [handleSig])

  // متابعة حالة المكالمة نفسها (اترفضت؟ اتقبلت؟ خلصت؟)
  const onRow = useRef<(r: Row) => void>(() => {})
  const watch = useCallback((id: string) => {
    const ch = supabase.channel('call-' + id + '-' + Math.random().toString(36).slice(2))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'calls', filter: `id=eq.${id}` }, (p) => onRow.current(p.new as Row))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'call_signals', filter: `call_id=eq.${id}` }, (p) => handleSig(p.new as Sig))
      .subscribe()
    subs.current.push(ch)
    // احتياطي لو التحديث اللحظي اتأخر
    const poll = async () => {
      if (cur.current?.id !== id || cur.current.phase === 'ended') return
      const { data } = await supabase.from('calls').select('id,caller_id,callee_id,kind,status,created_at').eq('id', id).maybeSingle()
      if (data) onRow.current(data as Row)
      const ph = (): Phase | null => (cur.current?.id === id ? cur.current.phase : null)
      if (ph() === 'connecting' || ph() === 'outgoing') await pullSigs(id)
      const p2 = ph()
      if (p2 && p2 !== 'ended') timers.current.push(window.setTimeout(poll, p2 === 'live' ? 6000 : 1500))
    }
    timers.current.push(window.setTimeout(poll, 1500))
  }, [handleSig, pullSigs])

  const makePc = useCallback(async (id: string, stream: MediaStream) => {
    const ice = await getIce()
    patch({ relay: ice.relay })
    const p = new RTCPeerConnection({ iceServers: ice.servers })
    pc.current = p
    stream.getTracks().forEach((t) => p.addTrack(t, stream))
    p.ontrack = (e) => {
      const s = e.streams[0] ?? new MediaStream([e.track])
      setRemote(new MediaStream(s.getTracks()))
      e.track.onunmute = () => setRemote(new MediaStream(s.getTracks()))
    }
    p.onicecandidate = (e) => { if (e.candidate) sendSig(id, 'ice', e.candidate.toJSON()) }
    p.ondatachannel = (e) => bindDc(e.channel)
    let lost: number | null = null
    p.onconnectionstatechange = () => {
      const st = p.connectionState
      if (st === 'connected') {
        if (lost) { clearTimeout(lost); lost = null }
        if (cur.current?.id === id && cur.current.phase !== 'live') patch({ phase: 'live', since: Date.now() })
      } else if (st === 'failed') {
        supabase.rpc('end_call', { p_id: id }).then(() => {})
        finish('تعذّر توصيل المكالمة. ممكن يكون النت ضعيف عند حد فيكم.')
      } else if (st === 'disconnected' && !lost) {
        lost = window.setTimeout(() => {
          if (p.connectionState !== 'connected' && cur.current?.id === id) { supabase.rpc('end_call', { p_id: id }).then(() => {}); finish('انقطع الاتصال.') }
        }, 12000)
        timers.current.push(lost)
      }
    }
    return p
  }, [patch, finish])

  onRow.current = async (r: Row) => {
    const c = cur.current
    if (!c || c.id !== r.id || c.phase === 'ended') return
    if (FINAL.includes(r.status)) {
      const t = r.status === 'declined' ? (c.role === 'caller' ? 'رفض المكالمة.' : null)
        : r.status === 'missed' ? (c.role === 'caller' ? 'مفيش رد.' : null)
        : r.status === 'canceled' ? null
        : 'انتهت المكالمة.'
      finish(t)
      return
    }
    if (r.status === 'accepted' && c.role === 'caller' && c.phase === 'outgoing') {
      stopRing()
      if (!media.current) return
      patch({ phase: 'connecting' })
      const p = await makePc(c.id, media.current)
      bindDc(p.createDataChannel('state'))
      const offer = await p.createOffer()
      await p.setLocalDescription(offer)
      await sendSig(c.id, 'offer', { type: offer.type, sdp: offer.sdp })
      await pullSigs(c.id)
    }
  }

  const prepMedia = async (kind: CallKind) => {
    const { stream, noCam } = await getMedia(kind)
    media.current = stream; setLocal(stream)
    if (noCam && kind === 'video') { state.current.cam = true; setCamOff(true) }
    try { const d = await navigator.mediaDevices.enumerateDevices(); setCanFlip(d.filter((x) => x.kind === 'videoinput').length > 1) } catch { setCanFlip(false) }
  }

  const start = useCallback(async (peer: Peer, kind: CallKind) => {
    if (cur.current && cur.current.phase !== 'ended') { tell('أنت في مكالمة', 'اقفل المكالمة الحالية الأول.'); return }
    cleanup()
    set({ id: '', role: 'caller', kind, phase: 'outgoing', peer })
    try {
      await prepMedia(kind)
      const { data, error } = await supabase.rpc('start_call', { p_callee: peer.id, p_kind: kind })
      if (error) throw error
      const id = data as string
      if (!cur.current) { supabase.rpc('end_call', { p_id: id }); cleanup(); return } // اتقفلت قبل ما تبدأ
      set({ ...cur.current, id })
      watch(id)
      startRing(ringOut, 3000)
      timers.current.push(window.setTimeout(async () => {
        if (cur.current?.id === id && cur.current.phase === 'outgoing') {
          await supabase.rpc('end_call', { p_id: id, p_missed: true })
          finish('مفيش رد.')
        }
      }, RING_SECS * 1000))
    } catch (e) {
      cleanup(); set(null)
      tell('مش قادر أبدأ المكالمة', friendly(e))
    }
  }, [cleanup, set, watch, finish])

  const accept = useCallback(async () => {
    const c = cur.current
    if (!c || c.phase !== 'incoming') return
    stopRing()
    patch({ phase: 'connecting' })
    try {
      await prepMedia(c.kind)
      await makePc(c.id, media.current!)
      const { data, error } = await supabase.rpc('answer_call', { p_id: c.id, p_accept: true })
      if (error) throw error
      if (data !== 'accepted') { finish('المكالمة خلصت قبل ما ترد.'); return }
      await pullSigs(c.id)
    } catch (e) {
      supabase.rpc('answer_call', { p_id: c.id, p_accept: false }).then(() => {})
      finish(null)
      tell('مش قادر أرد على المكالمة', friendly(e))
    }
  }, [patch, makePc, pullSigs, finish])

  const decline = useCallback(() => {
    const c = cur.current; if (!c) return
    if (c.id) supabase.rpc('answer_call', { p_id: c.id, p_accept: false }).then(() => {})
    finish(null)
  }, [finish])

  const hangup = useCallback(() => {
    const c = cur.current; if (!c) return
    if (c.phase === 'ended') { set(null); return }
    if (c.id) supabase.rpc('end_call', { p_id: c.id }).then(() => {})
    finish(c.phase === 'live' ? 'انتهت المكالمة.' : null)
  }, [finish, set])

  const toggleMic = useCallback(() => {
    const t = media.current?.getAudioTracks()[0]; if (!t) return
    t.enabled = !t.enabled; state.current.mic = !t.enabled; setMicOff(!t.enabled); sendState()
  }, [])
  const toggleCam = useCallback(() => {
    const t = media.current?.getVideoTracks()[0]; if (!t) return
    t.enabled = !t.enabled; state.current.cam = !t.enabled; setCamOff(!t.enabled); sendState()
  }, [])
  const flip = useCallback(async () => {
    const s = media.current; const old = s?.getVideoTracks()[0]; if (!s || !old) return
    const want = facing.current === 'user' ? 'environment' : 'user'
    try {
      const ns = await navigator.mediaDevices.getUserMedia({ video: { facingMode: want } })
      const nt = ns.getVideoTracks()[0]
      nt.enabled = old.enabled
      await pc.current?.getSenders().find((x) => x.track?.kind === 'video')?.replaceTrack(nt)
      s.removeTrack(old); old.stop(); s.addTrack(nt)
      facing.current = want
      setLocal(new MediaStream(s.getTracks()))
    } catch { /* الكاميرا التانية مش متاحة */ }
  }, [])

  // مكالمات جاية ليا
  useEffect(() => {
    if (!uid) return
    const show = async (r: Row) => {
      if (r.callee_id !== uid || r.status !== 'ringing') return
      if (Date.now() - new Date(r.created_at).getTime() > RING_SECS * 1000) return
      if (cur.current && cur.current.phase !== 'ended') {
        if (cur.current.id !== r.id) supabase.rpc('answer_call', { p_id: r.id, p_accept: false }).then(() => {}) // مشغول
        return
      }
      const { data } = await supabase.from('profiles').select('id,name,avatar_url').eq('id', r.caller_id).maybeSingle()
      if (cur.current && cur.current.phase !== 'ended') return
      cleanup()
      set({ id: r.id, role: 'callee', kind: r.kind, phase: 'incoming', peer: (data as Peer) ?? { id: r.caller_id, name: '…', avatar_url: null } })
      watch(r.id)
      startRing(ringIn, 2500)
      const left = RING_SECS * 1000 - (Date.now() - new Date(r.created_at).getTime())
      timers.current.push(window.setTimeout(() => { if (cur.current?.id === r.id && cur.current.phase === 'incoming') finish(null) }, Math.max(left, 1000)))
    }
    const check = async () => {
      const since = new Date(Date.now() - RING_SECS * 1000).toISOString()
      const { data, error } = await supabase.from('calls').select('id,caller_id,callee_id,kind,status,created_at').eq('callee_id', uid).eq('status', 'ringing').gt('created_at', since).order('created_at', { ascending: false }).limit(1)
      if (!error && data?.[0]) show(data[0] as Row)
    }
    const ch = supabase.channel('calls-in-' + uid + '-' + Math.random().toString(36).slice(2))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'calls', filter: `callee_id=eq.${uid}` }, (p) => show(p.new as Row))
      .subscribe()
    check()
    const vis = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', vis)
    // احتياطي خفيف لو التحديث اللحظي مش شغال
    const t = window.setInterval(() => { if (document.visibilityState === 'visible' && !cur.current) check() }, 8000)
    return () => { supabase.removeChannel(ch); document.removeEventListener('visibilitychange', vis); clearInterval(t) }
  }, [uid, cleanup, set, watch, finish])

  // لو الصفحة اتقفلت وانت في مكالمة: نقفلها عند الطرف التاني
  useEffect(() => {
    const bye = () => {
      const c = cur.current; if (!c?.id || c.phase === 'ended') return
      const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
      const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
      const token = (session as { access_token?: string } | null)?.access_token
      if (!url || !key || !token) return
      const fn = c.phase === 'incoming' ? 'answer_call' : 'end_call'
      const body = c.phase === 'incoming' ? { p_id: c.id, p_accept: false } : { p_id: c.id }
      try { fetch(`${url}/rest/v1/rpc/${fn}`, { method: 'POST', keepalive: true, headers: { apikey: key, authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: JSON.stringify(body) }) } catch { /* */ }
    }
    window.addEventListener('pagehide', bye)
    return () => window.removeEventListener('pagehide', bye)
  }, [session])

  useEffect(() => () => cleanup(), [cleanup])

  return <C.Provider value={{ call, local, remote, micOff, camOff, peerMicOff, peerCamOff, canFlip, start, accept, decline, hangup, toggleMic, toggleCam, flip }}>{children}</C.Provider>
}
