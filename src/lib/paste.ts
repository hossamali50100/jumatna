// بيطلع الصور من الحافظة لما المستخدم يعمل لصق (Ctrl+V) — زي صورة منسوخة من جوجل
const OK = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
export function pastedImages(e: React.ClipboardEvent): File[] {
  const out: File[] = []
  for (const it of Array.from(e.clipboardData?.items ?? [])) {
    if (it.kind !== 'file' || !OK.includes(it.type)) continue
    const f = it.getAsFile()
    if (f) out.push(f.name && f.name !== 'image.png' ? f : new File([f], `paste.${it.type.split('/')[1]}`, { type: it.type }))
  }
  return out
}
