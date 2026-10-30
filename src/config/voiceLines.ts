export type VoiceLineState = {
  phone: string
  assignedUserId: string | null
  claimedBy: string | null
  claimedAt: number | null
}

const STALE_MS = 90_000

function heldBySomeoneElse(line: VoiceLineState, userId: string, now: number) {
  if (!line.claimedBy || line.claimedBy === userId) return false
  if (line.claimedAt == null) return false
  return now - line.claimedAt < STALE_MS
}

function availableTo(line: VoiceLineState, userId: string, now: number) {
  if (line.assignedUserId && line.assignedUserId !== userId) return false
  return !heldBySomeoneElse(line, userId, now)
}

/** A linha do próprio usuário vem primeiro. Sem ela, entra uma linha livre. */
export function pickVoiceLine(
  lines: VoiceLineState[],
  userId: string,
  now: number,
) {
  const mine = lines.find(
    (line) => line.assignedUserId === userId && availableTo(line, userId, now),
  )
  if (mine) return mine.phone
  return (
    lines.find((line) => !line.assignedUserId && availableTo(line, userId, now))
      ?.phone ?? null
  )
}
