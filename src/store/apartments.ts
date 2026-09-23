import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  ALL_APARTMENTS,
  apartmentStorageId,
  type BuildingKind,
  type Ending,
  type ApartmentStatus,
  isApartmentStatus,
} from '../config/building'
import {
  DEFAULT_SURROUNDINGS,
  type SurroundingItem,
  type SurroundingsConfig,
} from '../config/surroundings'
import { createLocalId } from '../utils/localCrypto'

export type ApartmentStatuses = Record<string, ApartmentStatus>
export type ApartmentAssignment = {
  ball: string
  participant: string
  assignedAt: string
  createdBy?: string
  updatedAt?: string
  updatedBy?: string
  lastJustification?: string
}
export type ApartmentAssignments = Record<string, ApartmentAssignment>
export type AuditAction = 'created' | 'updated' | 'removed' | 'imported'
export type AuditEvent = {
  id: string
  apartmentId: string
  action: AuditAction
  actor: string
  timestamp: string
  reason: string
  before?: ApartmentAssignment
  after?: ApartmentAssignment
}

type Snapshot = {
  statuses: ApartmentStatuses
  assignments: ApartmentAssignments
}

type ApartmentStore = {
  statuses: ApartmentStatuses
  assignments: ApartmentAssignments
  auditLog: AuditEvent[]
  surroundings: SurroundingsConfig
  history: Snapshot[]
  setStatus: (ids: string[], status: ApartmentStatus) => void
  assignApartment: (
    id: string,
    status: ApartmentStatus,
    assignment: ApartmentAssignment,
  ) => void
  saveReservation: (
    id: string,
    input: Pick<ApartmentAssignment, 'ball' | 'participant'>,
    actor: string,
    reason?: string,
  ) => void
  removeReservation: (id: string, actor: string, reason: string) => void
  setSurroundings: (
    building: BuildingKind,
    ending: Ending,
    items: SurroundingItem[],
  ) => void
  replaceData: (
    statuses: ApartmentStatuses,
    assignments?: ApartmentAssignments,
    auditLog?: AuditEvent[],
    surroundings?: SurroundingsConfig,
  ) => void
  clearAll: () => void
  undo: () => void
}

export const EMPTY_STATUSES: ApartmentStatuses = Object.fromEntries(
  ALL_APARTMENTS.map(({ storageId }) => [storageId, 'none']),
)

function currentApartmentId(id: string): string {
  if (id.includes(':')) return id
  const legacy = id.match(/^(\d{2})0([1-4])$/)
  const oddId = legacy ? `${Number(legacy[1])}${legacy[2]}` : id
  return apartmentStorageId('odd', oddId)
}

export function normalizeStatuses(value: unknown): ApartmentStatuses | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const source = value as Record<string, unknown>
  const normalized = { ...EMPTY_STATUSES }
  for (const [id, status] of Object.entries(source)) {
    const normalizedId = currentApartmentId(id)
    if (!(normalizedId in EMPTY_STATUSES) || !isApartmentStatus(status)) return null
    normalized[normalizedId] = status
  }
  return normalized
}

export function normalizeAssignments(value: unknown): ApartmentAssignments | null {
  if (value === undefined) return {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const normalized: ApartmentAssignments = {}
  for (const [id, assignment] of Object.entries(
    value as Record<string, unknown>,
  )) {
    const normalizedId = currentApartmentId(id)
    if (
      !(normalizedId in EMPTY_STATUSES) ||
      !assignment ||
      typeof assignment !== 'object' ||
      Array.isArray(assignment)
    ) {
      return null
    }
    const candidate = assignment as Record<string, unknown>
    if (
      typeof candidate.ball !== 'string' ||
      typeof candidate.participant !== 'string' ||
      typeof candidate.assignedAt !== 'string'
    ) {
      return null
    }
    normalized[normalizedId] = {
      ball: candidate.ball,
      participant: candidate.participant,
      assignedAt: candidate.assignedAt,
      createdBy:
        typeof candidate.createdBy === 'string'
          ? candidate.createdBy
          : 'Registro anterior',
      updatedAt:
        typeof candidate.updatedAt === 'string'
          ? candidate.updatedAt
          : undefined,
      updatedBy:
        typeof candidate.updatedBy === 'string'
          ? candidate.updatedBy
          : undefined,
      lastJustification:
        typeof candidate.lastJustification === 'string'
          ? candidate.lastJustification
          : undefined,
    }
  }
  return normalized
}

function cloneDefaultSurroundings(): SurroundingsConfig {
  return structuredClone(DEFAULT_SURROUNDINGS)
}

function snapshot(
  statuses: ApartmentStatuses,
  assignments: ApartmentAssignments,
): Snapshot {
  return { statuses: { ...statuses }, assignments: { ...assignments } }
}

export const useApartmentStore = create<ApartmentStore>()(
  persist(
    (set) => ({
      statuses: { ...EMPTY_STATUSES },
      assignments: {},
      auditLog: [],
      surroundings: cloneDefaultSurroundings(),
      history: [],
      setStatus: (ids, status) =>
        set((state) => {
          const validIds = ids.filter((id) => id in EMPTY_STATUSES)
          if (
            validIds.length === 0 ||
            validIds.every((id) => state.statuses[id] === status)
          ) {
            return state
          }

          const next = { ...state.statuses }
          validIds.forEach((id) => {
            next[id] = status
          })
          const nextAssignments = { ...state.assignments }
          if (status === 'none') {
            validIds.forEach((id) => delete nextAssignments[id])
          }
          return {
            statuses: next,
            assignments: nextAssignments,
            history: [
              ...state.history.slice(-19),
              snapshot(state.statuses, state.assignments),
            ],
          }
        }),
      assignApartment: (id, status, assignment) =>
        set((state) => {
          if (!(id in EMPTY_STATUSES) || status === 'none') return state
          return {
            statuses: { ...state.statuses, [id]: status },
            assignments: { ...state.assignments, [id]: assignment },
            history: [
              ...state.history.slice(-19),
              snapshot(state.statuses, state.assignments),
            ],
          }
        }),
      saveReservation: (id, input, actor, reason = '') =>
        set((state) => {
          if (!(id in EMPTY_STATUSES)) return state
          const existing = state.assignments[id]
          const wasReserved = state.statuses[id] !== 'none'
          const timestamp = new Date().toISOString()
          const nextAssignment: ApartmentAssignment = existing
            ? {
                ...existing,
                ...input,
                updatedAt: timestamp,
                updatedBy: actor,
                lastJustification: reason,
              }
            : wasReserved
              ? {
                  ...input,
                  assignedAt: timestamp,
                  createdBy: 'Registro anterior',
                  updatedAt: timestamp,
                  updatedBy: actor,
                  lastJustification: reason,
                }
            : {
                ...input,
                assignedAt: timestamp,
                createdBy: actor,
              }
          const event: AuditEvent = {
            id: createLocalId(),
            apartmentId: id,
            action: wasReserved ? 'updated' : 'created',
            actor,
            timestamp,
            reason,
            before: existing,
            after: nextAssignment,
          }
          return {
            statuses: { ...state.statuses, [id]: 'reserved' },
            assignments: {
              ...state.assignments,
              [id]: nextAssignment,
            },
            auditLog: [...state.auditLog, event],
            history: [
              ...state.history.slice(-19),
              snapshot(state.statuses, state.assignments),
            ],
          }
        }),
      removeReservation: (id, actor, reason) =>
        set((state) => {
          const existing = state.assignments[id]
          if (
            !(id in EMPTY_STATUSES) ||
            state.statuses[id] === 'none' ||
            !reason.trim()
          ) {
            return state
          }
          const nextAssignments = { ...state.assignments }
          delete nextAssignments[id]
          const timestamp = new Date().toISOString()
          return {
            statuses: { ...state.statuses, [id]: 'none' },
            assignments: nextAssignments,
            auditLog: [
              ...state.auditLog,
              {
                id: createLocalId(),
                apartmentId: id,
                action: 'removed',
                actor,
                timestamp,
                reason: reason.trim(),
                before: existing,
              },
            ],
            history: [
              ...state.history.slice(-19),
              snapshot(state.statuses, state.assignments),
            ],
          }
        }),
      setSurroundings: (building, ending, items) =>
        set((state) => ({
          surroundings: {
            ...state.surroundings,
            [building]: {
              ...state.surroundings[building],
              [ending]: items,
            },
          },
        })),
      replaceData: (statuses, assignments = {}, auditLog = [], surroundings) =>
        set((state) => ({
          statuses: { ...statuses },
          assignments: { ...assignments },
          auditLog: [...auditLog],
          surroundings: surroundings ?? state.surroundings,
          history: [
            ...state.history.slice(-19),
            snapshot(state.statuses, state.assignments),
          ],
        })),
      clearAll: () =>
        set((state) => ({
          statuses: { ...EMPTY_STATUSES },
          assignments: {},
          history: [
            ...state.history.slice(-19),
            snapshot(state.statuses, state.assignments),
          ],
        })),
      undo: () =>
        set((state) => {
          const previous = state.history.at(-1)
          if (!previous) return state
          return {
            statuses: { ...previous.statuses },
            assignments: { ...previous.assignments },
            history: state.history.slice(0, -1),
          }
        }),
    }),
    {
      name: 'firenzze-apartment-map-v2',
      partialize: ({ statuses, assignments, auditLog, surroundings }) => ({
        statuses,
        assignments,
        auditLog,
        surroundings,
      }),
      merge: (persisted, current) => {
        const saved = persisted as
          | {
              statuses?: unknown
              assignments?: unknown
              auditLog?: unknown
              surroundings?: unknown
            }
          | undefined
        const currentVersion = normalizeStatuses(saved?.statuses)
        const currentAssignments = normalizeAssignments(saved?.assignments)
        if (currentVersion) {
          return {
            ...current,
            statuses: currentVersion,
            assignments: currentAssignments ?? {},
            auditLog: Array.isArray(saved?.auditLog)
              ? (saved.auditLog as AuditEvent[])
              : [],
            surroundings:
              saved?.surroundings &&
              typeof saved.surroundings === 'object' &&
              !Array.isArray(saved.surroundings)
                ? (saved.surroundings as SurroundingsConfig)
                : cloneDefaultSurroundings(),
          }
        }

        const legacyRaw = window.localStorage.getItem('g15-apartment-map-v1')
        let legacyStatuses: unknown
        try {
          legacyStatuses = legacyRaw
            ? (JSON.parse(legacyRaw) as { state?: { statuses?: unknown } }).state
                ?.statuses
            : undefined
        } catch {
          legacyStatuses = undefined
        }
        return {
          ...current,
          statuses: normalizeStatuses(legacyStatuses) ?? current.statuses,
        }
      },
    },
  ),
)

