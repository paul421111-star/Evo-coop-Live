import type { CSSProperties } from 'react'
import { KeyRound } from 'lucide-react'
import {
  SELECTED_UNIT_COLOR,
  STATUS_BY_ID,
  apartmentId,
  apartmentStorageId,
  buildingFloors,
  type ApartmentStatus,
  type BuildingConfig,
  type Ending,
} from '../config/building'
import type { ApartmentAssignments } from '../store/apartments'

type Props = {
  config: BuildingConfig
  statuses: Record<string, ApartmentStatus>
  assignments: ApartmentAssignments
  selectedId: string
  floorFilter: number | 'all'
  endingFilter: Ending | 'all'
  statusFilter: ApartmentStatus | 'all'
  onSelect: (id: string) => void
  onActivate: (id: string) => void
  onClearTest?: () => void
  readOnly?: boolean
}

type StatusStyle = CSSProperties & { '--unit-color': string }

export function floorIsComplete(
  apartmentIds: string[],
  statuses: Record<string, ApartmentStatus>,
) {
  return (
    apartmentIds.length > 0 &&
    apartmentIds.every((id) => statuses[id] === 'reserved')
  )
}

export function ApartmentGrid({
  config,
  statuses,
  assignments,
  selectedId,
  floorFilter,
  endingFilter,
  statusFilter,
  onSelect,
  onActivate,
  onClearTest,
  readOnly = false,
}: Props) {
  const floors =
    floorFilter === 'all'
      ? buildingFloors(config).reverse()
      : [floorFilter]

  const endings = endingFilter === 'all' ? config.endings : [endingFilter]
  const columns = `45px repeat(${endings.length}, minmax(${
    endings.length > 4 ? 38 : 52
  }px, 1fr))`
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
        <span className="inventory-caption-side">
          <span>{visibleCount} exibidas</span>
          {onClearTest && (
            <button type="button" onClick={onClearTest}>
              Limpar tudo
            </button>
          )}
        </span>
      </div>
      <div className="inventory-table" aria-label="Apartamentos por andar">
        <div
          className="grid-row grid-header"
          style={{ gridTemplateColumns: columns }}
        >
          <span>Andar</span>
          {endings.map((ending) => (
            <span key={ending}>
              Final {ending}
            </span>
          ))}
        </div>

        {floors.map((floor) => {
          const floorIds = config.apartments
            .filter((apartment) => apartment.floor === floor)
            .map((apartment) => apartment.id)
          const complete = floorIsComplete(floorIds, statuses)
          return (
            <div
              className="grid-row"
              key={floor}
              style={{ gridTemplateColumns: columns }}
            >
            <span
              className={`floor-number ${complete ? 'is-complete' : ''}`}
              title={complete ? 'Andar completo' : undefined}
            >
              {floor === 0 ? 'T' : `${String(floor).padStart(2, '0')}º`}
            </span>
            {endings.map((ending) => {
              const id = apartmentId(floor, ending)
              if (!config.apartmentById[id]) {
                return (
                  <span
                    key={id}
                    className="unit-cell is-unavailable"
                    aria-label={`Final ${ending} inexistente no térreo`}
                  >
                    —
                  </span>
                )
              }
              const status = statuses[id] ?? 'none'
              const assignment =
                assignments[apartmentStorageId(config.kind, id)]
              const hidden = statusFilter !== 'all' && status !== statusFilter
              const selected = selectedId === id
              const statusData = selected
                ? {
                    ...STATUS_BY_ID[status],
                    label: status === 'none' ? 'Selecionado' : STATUS_BY_ID[status].label,
                    color: SELECTED_UNIT_COLOR,
                  }
                : STATUS_BY_ID[status]
              return (
                <button
                  key={id}
                  type="button"
                  className={`unit-cell ${selected ? 'is-selected' : ''} ${
                    status === 'reserved' ? 'is-reserved' : ''
                  } ${hidden ? 'is-filtered' : ''}${readOnly ? ' is-readonly' : ''}`}
                  style={{ '--unit-color': statusData.color } as StatusStyle}
                  onClick={readOnly ? undefined : () => onSelect(id)}
                  onDoubleClick={readOnly ? undefined : () => onActivate(id)}
                  disabled={hidden}
                  aria-label={`Apartamento ${id}, ${statusData.label}`}
                  aria-pressed={selectedId === id}
                  title={
                    readOnly
                      ? `Apto ${id} · ${statusData.label}`
                      : `Apto ${id} · ${statusData.label} · duplo clique para registrar`
                  }
                >
                  <span className="unit-cell-main">
                    {status === 'reserved' ? (
                      <KeyRound size={11} className="unit-key" aria-hidden="true" />
                    ) : (
                      <span className="unit-dot" />
                    )}
                    <b>{id}</b>
                  </span>
                  {assignment && (
                    <small title={`Código associado ${assignment.ball}`}>
                      {assignment.ball}
                    </small>
                  )}
                </button>
              )
            })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

