import DmThread from './DmThread'
import RoomThread from './RoomThread'
import { isRoom, roomKey } from '../lib/rooms'

// محادثة شخص أو مجموعة شات (المجموعات معرّفها بيبدأ بـ room:)
export default function Thread({ id, height, fill }: { id: string; height?: number; fill?: boolean }) {
  return isRoom(id) ? <RoomThread key={id} roomId={roomKey(id)} height={height} fill={fill} /> : <DmThread key={id} otherId={id} height={height} fill={fill} />
}
