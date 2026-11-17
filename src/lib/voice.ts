import { supabase } from './supabase'

export const VOICE_MAX = 120 // أقصى مدة للرسالة الصوتية بالثواني
export const VOICE_BODY = '🎤 رسالة صوتية' // نص بديل بيظهر في قائمة المحادثات وفي النسخ القديمة

// بنفضّل mp4 (بيشتغل على آيفون وأندرويد والكمبيوتر) ولو مش متاح نستخدم webm
const TYPES = ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']
export const canRecord = () => typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
export const pickType = () => TYPES.find((t) => { try { return MediaRecorder.isTypeSupported(t) } catch { return false } }) ?? ''

export async function uploadVoice(blob: Blob, uid: string): Promise<string> {
  const base = (blob.type || 'audio/webm').split(';')[0]
  const ext = base === 'audio/mp4' ? 'm4a' : base === 'audio/ogg' ? 'ogg' : base === 'audio/webm' ? 'webm' : ''
  if (!ext) throw new Error('صيغة التسجيل غير مدعومة على الجهاز ده.')
  if (blob.size > 5 * 1024 * 1024) throw new Error('الرسالة الصوتية أكبر من 5 ميجا.')
  const path = `${uid}/${crypto.randomUUID()}.${ext}`
  // بنشيل تفاصيل الترميز من النوع (audio/mp4;codecs=…) عشان المخزن يقبله
  const { error } = await supabase.storage.from('media').upload(path, new Blob([blob], { type: base }), { contentType: base })
  if (error) throw new Error(/mime|not supported|invalid/i.test(error.message) ? 'الرسائل الصوتية محتاجة تحديث 046 في Supabase (مرة واحدة).' : 'تعذّر رفع التسجيل: ' + error.message)
  return supabase.storage.from('media').getPublicUrl(path).data.publicUrl
}

export const voiceErr = (e: { message: string }) =>
  /audio_url|audio_secs|schema cache|column/i.test(e.message) ? new Error('الرسائل الصوتية محتاجة تحديث 046 في Supabase (مرة واحدة).') : e
