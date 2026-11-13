// أيقونات صغيرة لقوايم الشات
const P: Record<string, string> = {
  user: 'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z',
  users: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.9M16 3.1a4 4 0 010 7.8',
  userPlus: 'M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M8.500 11a4 4 0 100-8 4 4 0 000 8zM20 8v6M23 11h-6',
  bellOff: 'M13.700 21a2 2 0 01-3.400 0M18.600 13A17.900 17.900 0 0118 8a6 6 0 00-9.300-5M6.300 6.300A6 6 0 006 8c0 7-3 9-3 9h14M1 1l22 22',
  bell: 'M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.700 21a2 2 0 01-3.400 0',
  ban: 'M12 22a10 10 0 100-20 10 10 0 000 20zM4.900 4.900l14.200 14.200',
  trash: 'M3 6h18M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2',
  edit: 'M12 20h9M16.500 3.500a2.100 2.100 0 013 3L7 19l-4 1 1-4L16.500 3.500z',
  logout: 'M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9',
  undo: 'M3 7v6h6M3 13a9 9 0 109-9 9 9 0 00-6.400 2.600L3 9',
}
export function MI({ n, s = 20 }: { n: keyof typeof P; s?: number }) {
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flex: 'none' }}><path d={P[n]} /></svg>
}
// سهم القايمة (واضح)
export const Chev = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 9l6 6 6-6" /></svg>
