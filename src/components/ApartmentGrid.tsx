import type { CSSProperties } from 'react'
import {
  APARTMENTS,
  ENDINGS,
  FLOOR_COUNT,
  STATUS_BY_ID,
  apartmentId,
  type ApartmentStatus,
  type Ending,
} from '../config/building'

type Props = {
  statuses: Record<string, ApartmentStatus>
  selectedId: string
  floorFilter: number | 'all'
  endingFilter: Ending | 'all'
  statusFilter: ApartmentStatus | 'all'
  onSelect: (id: string) => void
}

type StatusStyle = CSSProperties & { '--unit-color': string }

export function ApartmentGrid({
  statuses,
  selectedId,
  floorFilter,
  endingFilter,
  statusFilter,
  onSelect,
}: Props) {
  const floors =
    floorFilter === 'all'
      ? Array.from({ length: FLOOR_COUNT }, (_, index) => FLOOR_COUNT - index)
      : [floorFilter]

  const endings = endingFilter === 'all' ? ENDINGS : [endingFilter]
  const visibleCount = APARTMENTS.filter(
    ({ floor, ending, id }) =>
      (floorFilter === 'all' || floor === floorFilter) &&
      (endingFilter === 'all' || ending === endingFilter) &&
      (statusFilter === 'all' || statuses[id] === statusFilter),
  ).length

  return (
    <div className="inventory-table-wrap">
      <div className="inventory-caption">
        <span>Mapa de unidades</span>
        <span>{visibleCount} exibidas</span>
      </div>
      <div className="inventory-table" aria-label="Apartamentos por andar">
        <div className="grid-row grid-header">
          <span>Andar</span>
          {endings.map((ending) => (
            <span key={ending}>
              Final {ending}
            </span>
          ))}
        </div>

        {floors.map((floor) => (
          <div className="grid-row" key={floor}>
            <span className="floor-number">
              {String(floor).padStart(2, '0')}º
            </span>
            {endings.map((ending) => {
              const id = apartmentId(floor, ending)
              const status = statuses[id] ?? 'none'
              const hidden = statusFilter !== 'all' && status !== statusFilter
              const statusData = STATUS_BY_ID[status]
              return (
                <button
                  key={id}
                  type="button"
                  className={`unit-cell ${selectedId === id ? 'is-selected' : ''} ${
                    hidden ? 'is-filtered' : ''
                  }`}
                  style={{ '--unit-color': statusData.color } as StatusStyle}
                  onClick={() => onSelect(id)}
                  disabled={hidden}
                  aria-label={`Apartamento ${id}, ${statusData.label}`}
                  aria-pressed={selectedId === id}
                  title={`Apto ${id} · ${statusData.label}`}
                >
                  <span className="unit-dot" />
                  <span>{id}</span>
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

