import type { BuildingKind } from './building'
import type { DrawGroup } from './drawGroups'

export type ChoiceSource = 'anticipator' | 'draw'
export type AnticipationSessionStatus =
  | 'draft'
  | 'locked'
  | 'active'
  | 'closed'
export type AnticipationEntryStatus = 'waiting' | 'selected' | 'declined'
export type AnticipationOfferStatus = 'pending' | 'confirmed' | 'withdrawn'

export type AnticipationEntry = {
  id: string
  associateCode: string
  participant: string
  paidInstallments: number
  anticipatedInstallments: number
  offeredInstallments: number
  totalInstallments: number
  status: AnticipationEntryStatus
  offerStatus: AnticipationOfferStatus
  offerSelectedAt?: string
  apartmentId?: string
  createdAt: string
}

export type AnticipationSession = {
  id: string
  building: BuildingKind
  drawGroup: DrawGroup | null
  title: string
  blockLabel: string
  startsAt: string
  endsAt: string
  status: AnticipationSessionStatus
  nextSource: ChoiceSource
  liveUrl: string
  /** Quantas posições do topo entram como antecipadoras. */
  anticipatorSlots: number
  portalPath: string
  entries: AnticipationEntry[]
  nextAnticipator: AnticipationEntry | null
  createdBy: string
  createdAt: string
  closedAt?: string
  /** Quantidade reaproveitada da sessão anterior ao criar esta sessão. */
  carriedOverCount?: number
}

export type AnticipationSessionInput = {
  building: BuildingKind
  drawGroup?: DrawGroup
  title: string
  blockLabel?: string
  startsAt: string
  endsAt: string
  liveUrl?: string
  anticipatorSlots?: number
}

export const DEFAULT_ANTICIPATOR_SLOTS = 112

export type AnticipationHistorySummary = {
  id: string
  building: BuildingKind
  drawGroup: DrawGroup | null
  blockLabel: string
  title: string
  startsAt: string
  closedAt: string
  entryCount: number
  qualifiedCount: number
  anticipatorSlots: number
}

export type AnticipationEntryInput = {
  associateCode: string
  participant: string
  paidInstallments: number
  anticipatedInstallments: number
  offeredInstallments: number
  documentTail?: string
}

export function rankAnticipators<T extends AnticipationEntryInput>(
  entries: T[],
): Array<T & { totalInstallments: number }> {
  return entries
    .map((entry) => ({
      ...entry,
      totalInstallments:
        entry.paidInstallments +
        entry.anticipatedInstallments +
        entry.offeredInstallments,
    }))
    .sort(
      (left, right) =>
        right.totalInstallments - left.totalInstallments ||
        Number(left.associateCode) - Number(right.associateCode),
    )
}

export function oppositeChoiceSource(source: ChoiceSource): ChoiceSource {
  return source === 'anticipator' ? 'draw' : 'anticipator'
}

export const OFFER_DECISION_MS = 24 * 60 * 60 * 1000

export function offerDecisionUntil(
  selectedAt: string | null | undefined,
): string | null {
  if (!selectedAt) return null
  const start = new Date(selectedAt).getTime()
  if (Number.isNaN(start)) return null
  return new Date(start + OFFER_DECISION_MS).toISOString()
}

export function isOfferDecisionOpen(
  selectedAt: string | null | undefined,
  now = Date.now(),
): boolean {
  const until = offerDecisionUntil(selectedAt)
  return Boolean(until && now < new Date(until).getTime())
}

export function youtubeEmbedUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.hostname === 'youtu.be') {
      const id = parsed.pathname.replace('/', '')
      return id ? `https://www.youtube.com/embed/${id}` : null
    }
    if (
      parsed.hostname === 'youtube.com' ||
      parsed.hostname === 'www.youtube.com'
    ) {
      const id = parsed.searchParams.get('v')
      return id ? `https://www.youtube.com/embed/${id}` : null
    }
  } catch {
    return null
  }
  return null
}

export type AssociatePortalRankingRow = {
  position: number
  associateCode: string
  paidInstallments: number
  anticipatedInstallments: number
  offeredInstallments: number
  totalInstallments: number
  status: AnticipationEntryStatus
  offerStatus: AnticipationOfferStatus
  apartmentId?: string
}

export type AssociatePortalView = {
  title: string
  status: AnticipationSessionStatus
  startsAt: string
  endsAt: string
  liveUrl: string
  nextSource: ChoiceSource
  anticipatorSlots: number
  ranking: AssociatePortalRankingRow[]
  you: (AssociatePortalRankingRow & {
    canSetOffer: boolean
    canConfirm: boolean
    canWithdraw: boolean
    offerDecisionUntil: string | null
    whatsappPhone: string
  }) | null
}
