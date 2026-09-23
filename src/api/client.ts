import type { AppUser } from '../auth/localAuth'
import type { BuildingKind, Ending } from '../config/building'
import type {
  SolarIllustration,
  SolarIllustrationsConfig,
  SurroundingItem,
  SurroundingsConfig,
} from '../config/surroundings'
import type {
  DrawDecline,
  DrawDeclineReason,
} from '../config/drawDeclines'
import type {
  ApartmentAssignments,
  ApartmentStatuses,
  AuditEvent,
} from '../store/apartments'

export type MapSnapshot = {
  statuses: Partial<ApartmentStatuses>
  assignments: ApartmentAssignments
  auditLog: AuditEvent[]
  surroundings: SurroundingsConfig
  solarIllustrations: SolarIllustrationsConfig
  declines?: DrawDecline[]
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
    input: { ball: string; participant: string; reason?: string },
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
  updateSolarIllustration: (
    building: BuildingKind,
    ending: Ending,
    illustration?: SolarIllustration,
  ) =>
    request<{ illustration: SolarIllustration | null }>(
      `/api/solar-illustrations/${building}/${ending}`,
      {
        method: 'PUT',
        body: JSON.stringify({ illustration: illustration ?? null }),
      },
    ),
  addDecline: (input: {
    building: BuildingKind
    ball: string
    participant: string
    reason: DrawDeclineReason
    notes?: string
  }) =>
    request<DrawDecline>('/api/declines', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  removeDecline: (id: string) =>
    request<void>(`/api/declines/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
}
