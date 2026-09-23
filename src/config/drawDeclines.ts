import type { BuildingKind } from './building'

export type DrawDeclineReason = 'refused' | 'next-tower' | 'no-answer'

export type DrawDecline = {
  id: string
  building: BuildingKind
  ball: string
  participant: string
  reason: DrawDeclineReason
  notes: string
  createdBy: string
  createdAt: string
}

export const DECLINE_REASON_OPTIONS: Array<{
  id: DrawDeclineReason
  label: string
}> = [
  { id: 'refused', label: 'Recusou' },
  { id: 'next-tower', label: 'Deixou para a próxima torre' },
  { id: 'no-answer', label: 'Não atendeu' },
]

export const DECLINE_REASON_BY_ID = Object.fromEntries(
  DECLINE_REASON_OPTIONS.map((option) => [option.id, option.label]),
) as Record<DrawDeclineReason, string>

export function isDrawDeclineReason(
  value: unknown,
): value is DrawDeclineReason {
  return DECLINE_REASON_OPTIONS.some((option) => option.id === value)
}
