import type { BuildingKind } from './building'
import type { DrawGroup } from './drawGroups'

export type ChoiceSource = 'anticipator' | 'draw'
export type AnticipationSessionStatus =
  | 'draft'
  | 'locked'
  | 'active'
  | 'closed'
/** `abdicated`: saiu da fila fora da vez e não gasta chamada de antecipador. */
export type AnticipationEntryStatus =
  | 'waiting'
  | 'selected'
  | 'declined'
  | 'abdicated'
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
  /** Marcado pelo administrador. Só fica fora do sorteio se a sessão não permitir. */
  delinquent: boolean
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
  /** Reserva feita, mas a plaquinha só muda no botão Próximo. */
  awaitingNext: boolean
  liveUrl: string
  /** Quantas posições do topo entram como antecipadoras. */
  anticipatorSlots: number
  /** Escolhas e abdições de antecipador já consumidas nesta sessão. */
  anticipatorTurnsUsed: number
  /** Limite para confirmar a antecipação. Depois disso vira "não antecipar". */
  confirmationDeadline: string | null
  portalPath: string
  entries: AnticipationEntry[]
  nextAnticipator: AnticipationEntry | null
  createdBy: string
  createdAt: string
  closedAt?: string
  /** Quantidade reaproveitada da sessão anterior ao criar esta sessão. */
  carriedOverCount?: number
  /** Inadimplente entra no portal e vê o aviso de que não participa. */
  delinquentCanAccess: boolean
  /** Inadimplente entra na fila e pode ser chamado. */
  delinquentCanParticipate: boolean
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

/**
 * Contrato inadimplente: participa, só assiste o portal, ou nem entra.
 * Participar vale mais do que apenas acessar.
 */
export function delinquentGate(
  delinquent: boolean,
  canAccess: boolean,
  canParticipate: boolean,
): 'participate' | 'watch' | 'blocked' {
  if (!delinquent || canParticipate) return 'participate'
  if (canAccess) return 'watch'
  return 'blocked'
}

export function oppositeChoiceSource(source: ChoiceSource): ChoiceSource {
  return source === 'anticipator' ? 'draw' : 'anticipator'
}

/** A chamada que a plaquinha está mostrando: 1º antecipador, 1º sorteado, 2º… */
export function turnCallLabel(input: {
  source: ChoiceSource
  anticipatorTurnsUsed: number
  drawReservations: number
  awaitingNext: boolean
}): string {
  if (input.source === 'anticipator') {
    return `${input.anticipatorTurnsUsed + 1}º antecipador`
  }
  const n = input.awaitingNext
    ? Math.max(input.drawReservations, 1)
    : input.drawReservations + 1
  return `${n}º sorteado`
}

/**
 * Posição de chamada de cada associado no ranking. Quem abdicou fora da vez
 * não ocupa posição, então o próximo da fila sobe.
 */
export function callPositions(
  entries: ReadonlyArray<{ id: string; status: AnticipationEntryStatus }>,
): Map<string, number> {
  const positions = new Map<string, number>()
  let position = 0
  for (const entry of entries) {
    if (entry.status === 'abdicated') continue
    position += 1
    positions.set(entry.id, position)
  }
  return positions
}

/**
 * Depois das vagas de antecipador, a vez fica só no sorteio.
 * Abdicação conta na vaga, mas não troca a plaquinha antes disso.
 */
export function choiceSourceAfterTurn(
  current: ChoiceSource,
  consumedAnticipators: number,
  slots: number,
  abdication = false,
): ChoiceSource {
  if (consumedAnticipators >= slots) return 'draw'
  if (abdication) return current
  return oppositeChoiceSource(current)
}

export const OFFER_DECISION_MS = 24 * 60 * 60 * 1000

export function offerDecisionUntil(
  selectedAt: string | null | undefined,
  confirmationDeadline?: string | null,
): string | null {
  if (confirmationDeadline) {
    const until = new Date(confirmationDeadline).getTime()
    return Number.isNaN(until) ? null : new Date(until).toISOString()
  }
  if (!selectedAt) return null
  const start = new Date(selectedAt).getTime()
  if (Number.isNaN(start)) return null
  return new Date(start + OFFER_DECISION_MS).toISOString()
}

export function isOfferDecisionOpen(
  selectedAt: string | null | undefined,
  now = Date.now(),
  confirmationDeadline?: string | null,
): boolean {
  const until = offerDecisionUntil(selectedAt, confirmationDeadline)
  return Boolean(until && now < new Date(until).getTime())
}

export function youtubeEmbedUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.hostname === 'youtu.be') {
      const id = parsed.pathname.replace('/', '')
      return id ? youtubeEmbedSrc(id) : null
    }
    if (
      parsed.hostname === 'youtube.com' ||
      parsed.hostname === 'www.youtube.com'
    ) {
      const id = parsed.searchParams.get('v')
      return id ? youtubeEmbedSrc(id) : null
    }
  } catch {
    return null
  }
  return null
}

/** fs=0 esconde a tela cheia do YouTube. A nossa fica no mesmo quadro do parabéns. */
function youtubeEmbedSrc(id: string) {
  return `https://www.youtube.com/embed/${id}?fs=0&rel=0`
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
  choiceSource?: 'draw' | 'anticipator'
}

export type AssociatePortalView = {
  title: string
  drawGroup: string | null
  blockLabel: string
  status: AnticipationSessionStatus
  startsAt: string
  endsAt: string
  liveUrl: string
  nextSource: ChoiceSource
  anticipatorSlots: number
  confirmationDeadline: string | null
  ranking: AssociatePortalRankingRow[]
  you: (AssociatePortalRankingRow & {
    canSetOffer: boolean
    canConfirm: boolean
    canWithdraw: boolean
    offerDecisionUntil: string | null
    hasWhatsappPhone: boolean
    whatsappPhoneMasked: string
    /** Inadimplente com o sorteio fechado para ele. */
    drawExcluded: boolean
  }) | null
}
