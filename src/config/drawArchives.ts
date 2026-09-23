import type { BuildingKind } from './building'
import type { DrawDecline } from './drawDeclines'
import type { DrawGroup } from './drawGroups'
import type {
  ApartmentAssignments,
  AuditEvent,
} from '../store/apartments'

export type DrawArchiveSnapshot = {
  assignments: ApartmentAssignments
  declines: DrawDecline[]
  auditLog: AuditEvent[]
}

export type DrawArchiveSummary = {
  id: string
  building: BuildingKind
  drawGroup: DrawGroup | null
  title: string
  notes: string
  archivedBy: string
  archivedAt: string
  reservationCount: number
  declineCount: number
}

export type DrawArchive = DrawArchiveSummary & {
  snapshot: DrawArchiveSnapshot
}
