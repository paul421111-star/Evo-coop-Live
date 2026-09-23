import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  APARTMENT_BY_ID,
  APARTMENTS,
  type ApartmentStatus,
  isApartmentStatus,
} from '../config/building'

export type ApartmentStatuses = Record<string, ApartmentStatus>

type Snapshot = ApartmentStatuses

type ApartmentStore = {
  statuses: ApartmentStatuses
  history: Snapshot[]
  setStatus: (ids: string[], status: ApartmentStatus) => void
  replaceStatuses: (statuses: ApartmentStatuses) => void
  clearAll: () => void
  undo: () => void
}

export const EMPTY_STATUSES: ApartmentStatuses = Object.fromEntries(
  APARTMENTS.map(({ id }) => [id, 'none']),
)

export function normalizeStatuses(value: unknown): ApartmentStatuses | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const source = value as Record<string, unknown>
  const normalized = { ...EMPTY_STATUSES }
  for (const [id, status] of Object.entries(source)) {
    if (!(id in APARTMENT_BY_ID) || !isApartmentStatus(status)) return null
    normalized[id] = status
  }
  return normalized
}

function snapshot(statuses: ApartmentStatuses): Snapshot {
  return { ...statuses }
}

export const useApartmentStore = create<ApartmentStore>()(
  persist(
    (set) => ({
      statuses: { ...EMPTY_STATUSES },
      history: [],
      setStatus: (ids, status) =>
        set((state) => {
          const validIds = ids.filter((id) => id in APARTMENT_BY_ID)
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
          return {
            statuses: next,
            history: [...state.history.slice(-19), snapshot(state.statuses)],
          }
        }),
      replaceStatuses: (statuses) =>
        set((state) => ({
          statuses: { ...statuses },
          history: [...state.history.slice(-19), snapshot(state.statuses)],
        })),
      clearAll: () =>
        set((state) => ({
          statuses: { ...EMPTY_STATUSES },
          history: [...state.history.slice(-19), snapshot(state.statuses)],
        })),
      undo: () =>
        set((state) => {
          const previous = state.history.at(-1)
          if (!previous) return state
          return {
            statuses: snapshot(previous),
            history: state.history.slice(0, -1),
          }
        }),
    }),
    {
      name: 'g15-apartment-map-v1',
      partialize: ({ statuses }) => ({ statuses }),
      merge: (persisted, current) => {
        const saved = persisted as { statuses?: unknown } | undefined
        return {
          ...current,
          statuses: normalizeStatuses(saved?.statuses) ?? current.statuses,
        }
      },
    },
  ),
)

