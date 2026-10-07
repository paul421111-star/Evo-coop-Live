import type { AppUser } from '../auth/localAuth'
import type { BuildingKind, Ending } from '../config/building'
import type {
  EdgeLandmark,
  EdgeLandmarksConfig,
  SolarIllustration,
  SolarIllustrationsConfig,
  SurroundingItem,
  SurroundingsConfig,
} from '../config/surroundings'
import type {
  DrawArchive,
  DrawArchiveSummary,
} from '../config/drawArchives'
import type {
  DrawDecline,
  DrawDeclineReason,
  DrawDeclineSource,
} from '../config/drawDeclines'
import type { DrawGroup } from '../config/drawGroups'
import type {
  AnticipationEntryInput,
  AnticipationHistorySummary,
  AnticipationSession,
  AnticipationSessionInput,
  AssociatePortalView,
  ChoiceSource,
} from '../config/anticipation'
import type {
  ApartmentAssignments,
  ApartmentStatuses,
  AuditEvent,
} from '../store/apartments'
import type { IssueInput, ProductIssue } from '../config/issues'

export type MapSnapshot = {
  statuses: Partial<ApartmentStatuses>
  assignments: ApartmentAssignments
  auditLog: AuditEvent[]
  surroundings: SurroundingsConfig
  solarIllustrations: SolarIllustrationsConfig
  edgeLandmarks: EdgeLandmarksConfig
  declines?: DrawDecline[]
}

export type CobrancaLineState =
  | 'disconnected'
  | 'connecting'
  | 'pairing'
  | 'connected'
  | 'reconnecting'
  | 'logged_out'

export type CobrancaLine = {
  id: string
  name: string
  sigla: string
  department: 'cobranca'
  state: CobrancaLineState
  connected: boolean
  qr: string | null
  phone: string | null
  error: string | null
}

export type CobrancaAgent = {
  enabled: boolean
  installmentValue: number
  lineId: string | null
}

export type CobrancaConversation = {
  id: string
  jid: string
  phone: string | null
  contactName: string
  lastPreview: string
  lastMessageAt: string
  unreadCount: number
}

export type CobrancaMessage = {
  id: string
  fromMe: boolean
  body: string
  kind: string
  sentAt: string
  senderName: string
}

export type CobrancaLance = {
  id: string
  associateCode: string
  participant: string
  offeredInstallments: number
  anticipatedInstallments: number
  offerStatus: string
  whatsappPhone: string
  dispatchStatus: 'sent' | 'failed' | null
  dispatchError: string
  dispatchAmount: number | null
  sentAt: string | null
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: 'same-origin',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: string
    } | null
    throw new Error(payload?.error ?? 'Não foi possível concluir a operação.')
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export const api = {
  login: (username: string, password: string) =>
    request<AppUser>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  currentUser: () => request<AppUser>('/api/auth/me'),
  logout: () => request<void>('/api/auth/logout', { method: 'POST' }),
  users: () => request<AppUser[]>('/api/users'),
  createUser: (username: string, password: string) =>
    request<AppUser>('/api/users', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  removeUser: (id: string) =>
    request<void>(`/api/users/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
  map: () => request<MapSnapshot>('/api/map'),
  importMap: (snapshot: MapSnapshot) =>
    request<{ ok: true }>('/api/map/import', {
      method: 'POST',
      body: JSON.stringify(snapshot),
    }),
  saveReservation: (
    building: BuildingKind,
    apartmentId: string,
    input: {
      ball: string
      participant: string
      reason?: string
      choiceSource?: ChoiceSource
      anticipationSessionId?: string
      anticipationEntryId?: string
    },
  ) =>
    request<{
      assignment: ApartmentAssignments[string]
      audit: AuditEvent
    }>(
      `/api/reservations/${building}/${encodeURIComponent(apartmentId)}`,
      {
        method: 'PUT',
        body: JSON.stringify(input),
      },
    ),
  removeReservation: (
    building: BuildingKind,
    apartmentId: string,
    reason: string,
  ) =>
    request<{ audit: AuditEvent }>(
      `/api/reservations/${building}/${encodeURIComponent(apartmentId)}`,
      {
        method: 'DELETE',
        body: JSON.stringify({ reason }),
      },
    ),
  updateSurroundings: (
    building: BuildingKind,
    ending: Ending,
    items: SurroundingItem[],
  ) =>
    request<{ items: SurroundingItem[] }>(
      `/api/surroundings/${building}/${ending}`,
      {
        method: 'PUT',
        body: JSON.stringify({ items }),
      },
    ),
  updateSolarIllustrations: (
    building: BuildingKind,
    ending: Ending,
    illustrations: SolarIllustration[],
  ) =>
    request<{ illustrations: SolarIllustration[] }>(
      `/api/solar-illustrations/${building}/${ending}`,
      {
        method: 'PUT',
        body: JSON.stringify({ illustrations }),
      },
    ),
  updateEdgeLandmarks: (
    building: BuildingKind,
    ending: Ending,
    landmarks: EdgeLandmark[],
  ) =>
    request<{ landmarks: EdgeLandmark[] }>(
      `/api/edge-landmarks/${building}/${ending}`,
      {
        method: 'PUT',
        body: JSON.stringify({ landmarks }),
      },
    ),
  addDecline: (input: {
    building: BuildingKind
    ball: string
    participant: string
    source: DrawDeclineSource
    reason: DrawDeclineReason
    notes?: string
    anticipationSessionId?: string
    anticipationEntryId?: string
  }) =>
    request<DrawDecline>('/api/declines', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  removeDecline: (id: string) =>
    request<void>(`/api/declines/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
  currentAnticipationSession: (
    building: BuildingKind,
    drawGroup?: DrawGroup,
  ) =>
    request<AnticipationSession | null>(
      `/api/anticipation-sessions/current?building=${building}&group=${drawGroup ?? ''}`,
    ),
  createAnticipationSession: (input: AnticipationSessionInput) =>
    request<AnticipationSession>('/api/anticipation-sessions', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  setAnticipationSessionStatus: (
    id: string,
    status: AnticipationSession['status'],
  ) =>
    request<AnticipationSession>(
      `/api/anticipation-sessions/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      },
    ),
  setAnticipationLiveUrl: (id: string, liveUrl: string) =>
    request<AnticipationSession>(
      `/api/anticipation-sessions/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ liveUrl }),
      },
    ),
  setAnticipatorSlots: (id: string, anticipatorSlots: number) =>
    request<AnticipationSession>(
      `/api/anticipation-sessions/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ anticipatorSlots }),
      },
    ),
  setConfirmationDeadline: (id: string, confirmationDeadline: string | null) =>
    request<AnticipationSession>(
      `/api/anticipation-sessions/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ confirmationDeadline }),
      },
    ),
  addAnticipationEntry: (sessionId: string, input: AnticipationEntryInput) =>
    request<AnticipationSession>(
      `/api/anticipation-sessions/${encodeURIComponent(sessionId)}/entries`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
    ),
  resetAnticipationRanking: (sessionId: string) =>
    request<AnticipationSession>(
      `/api/anticipation-sessions/${encodeURIComponent(sessionId)}/reset`,
      { method: 'POST' },
    ),
  advanceAnticipationTurn: (sessionId: string) =>
    request<AnticipationSession>(
      `/api/anticipation-sessions/${encodeURIComponent(sessionId)}/next`,
      { method: 'POST' },
    ),
  removeAnticipationEntry: (sessionId: string, entryId: string) =>
    request<void>(
      `/api/anticipation-sessions/${encodeURIComponent(sessionId)}/entries/${encodeURIComponent(entryId)}`,
      { method: 'DELETE' },
    ),
  listAnticipationHistory: (
    building: BuildingKind,
    drawGroup?: DrawGroup,
  ) =>
    request<{ sessions: AnticipationHistorySummary[] }>(
      `/api/anticipation-sessions/history?building=${building}&group=${drawGroup ?? ''}`,
    ),
  getAnticipationHistory: (id: string) =>
    request<AnticipationSession>(
      `/api/anticipation-sessions/history/${encodeURIComponent(id)}`,
    ),
  listDrawArchives: () =>
    request<{ archives: DrawArchiveSummary[] }>('/api/draw-archives'),
  getDrawArchive: (id: string) =>
    request<DrawArchive>(`/api/draw-archives/${encodeURIComponent(id)}`),
  closeDrawSession: (input: {
    building: BuildingKind
    drawGroup?: DrawGroup
    notes?: string
  }) =>
    request<DrawArchiveSummary>('/api/draw-archives/close', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  cobrancaDesk: () =>
    request<{ lines: CobrancaLine[]; agent: CobrancaAgent }>(
      '/api/cobranca/whatsapp',
    ),
  createCobrancaLine: (name: string) =>
    request<CobrancaLine>('/api/cobranca/lines', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  removeCobrancaLine: (id: string) =>
    request<void>(`/api/cobranca/lines/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
  cobrancaChannel: (
    id: string,
    action: 'start' | 'stop' | 'restart' | 'unlink',
  ) =>
    request<{ state: string; qr: string | null; error: string | null }>(
      `/api/cobranca/lines/${encodeURIComponent(id)}/channel`,
      { method: 'POST', body: JSON.stringify({ action }) },
    ),
  cobrancaConversations: (lineId: string, search: string) =>
    request<CobrancaConversation[]>(
      `/api/cobranca/lines/${encodeURIComponent(lineId)}/conversations?q=${encodeURIComponent(search)}`,
    ),
  cobrancaMessages: (conversationId: string) =>
    request<CobrancaMessage[]>(
      `/api/cobranca/conversations/${encodeURIComponent(conversationId)}/messages`,
    ),
  cobrancaHistory: (conversationId: string) =>
    request<{ ok: true }>(
      `/api/cobranca/conversations/${encodeURIComponent(conversationId)}/history`,
      { method: 'POST', body: JSON.stringify({}) },
    ),
  sendCobrancaMessage: (conversationId: string, text: string) =>
    request<{ ok: true }>(
      `/api/cobranca/conversations/${encodeURIComponent(conversationId)}/messages`,
      { method: 'POST', body: JSON.stringify({ text }) },
    ),
  startCobrancaConversation: (lineId: string, phone: string, text: string) =>
    request<{ id: string }>(
      `/api/cobranca/lines/${encodeURIComponent(lineId)}/conversations`,
      { method: 'POST', body: JSON.stringify({ phone, text }) },
    ),
  saveCobrancaAgent: (input: CobrancaAgent) =>
    request<CobrancaAgent>('/api/cobranca/agent', {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
  cobrancaLances: (building: string, group: string) =>
    request<CobrancaLance[]>(
      `/api/cobranca/lances?building=${encodeURIComponent(building)}&group=${encodeURIComponent(group)}`,
    ),
  saveCobrancaPhone: (entryId: string, phone: string) =>
    request<{ phone: string }>(
      `/api/cobranca/entries/${encodeURIComponent(entryId)}/phone`,
      { method: 'PATCH', body: JSON.stringify({ phone }) },
    ),
  portalChallenge: () =>
    request<{ id: string; question: string }>('/api/public/portal/challenge'),
  portalAccess: (input: {
    associateCode: string
    documentTail: string
    challengeId: string
    answer: number
  }) =>
    request<{ ok: true }>('/api/public/portal/access', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  portalView: () => request<AssociatePortalView>('/api/public/portal'),
  portalOffer: (
    action: 'confirm' | 'withdraw' | 'set',
    offeredInstallments?: number,
    whatsappPhone?: string,
  ) =>
    request<{ ok: true }>('/api/public/portal/offer', {
      method: 'POST',
      body: JSON.stringify({ action, offeredInstallments, whatsappPhone }),
    }),
  portalLogout: () =>
    request<void>('/api/public/portal/logout', { method: 'POST' }),
  createIssue: (input: IssueInput) =>
    request<ProductIssue>('/api/issues', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  issues: () => request<ProductIssue[]>('/api/issues'),
  updateIssue: (
    id: string,
    patch: Partial<Pick<ProductIssue, 'stage' | 'priority' | 'kind'>>,
  ) =>
    request<ProductIssue>(`/api/issues/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
}
