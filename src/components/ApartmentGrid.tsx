import type { CSSProperties } from 'react'
import {
  STATUS_BY_ID,
  apartmentId,
  type ApartmentStatus,
  type BuildingConfig,
  type Ending,
} from '../config/building'

type Props = {
  config: BuildingConfig
  statuses: Record<string, ApartmentStatus>
  selectedId: string
  floorFilter: number | 'all'
  endingFilter: Ending | 'all'
  statusFilter: ApartmentStatus | 'all'
  onSelect: (id: string) => void
  onActivate: (id: string) => void
}

type StatusStyle = CSSProperties & { '--unit-color': string }

export function ApartmentGrid({
  config,
  statuses,
  selectedId,
  floorFilter,
  endingFilter,
  statusFilter,
  onSelect,
  onActivate,
}: Props) {
  const floors =
    floorFilter === 'all'
      ? Array.from(
          { length: config.floorCount },
          (_, index) => config.floorCount - index,
        )
      : [floorFilter]

  const endings = endingFilter === 'all' ? config.endings : [endingFilter]
  const visibleCount = config.apartments.filter(
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
        <div
          className="grid-row grid-header"
          style={{
            gridTemplateColumns: `45px repeat(${endings.length}, minmax(52px, 1fr))`,
          }}
        >
          <span>Andar</span>
          {endings.map((ending) => (
            <span key={ending}>
              Final {ending}
            </span>
          ))}
        </div>

        {floors.map((floor) => (
          <div
            className="grid-row"
            key={floor}
            style={{
              gridTemplateColumns: `45px repeat(${endings.length}, minmax(52px, 1fr))`,
            }}
          >
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
                  onDoubleClick={() => onActivate(id)}
                  disabled={hidden}
                  aria-label={`Apartamento ${id}, ${statusData.label}`}
                  aria-pressed={selectedId === id}
                  title={`Apto ${id} · ${statusData.label} · duplo clique para registrar`}
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

