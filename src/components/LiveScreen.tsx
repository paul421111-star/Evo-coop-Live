import { useEffect, useState, type CSSProperties } from 'react'
import { KeyRound, LogOut } from 'lucide-react'
import { api, type LiveBoard, type MapSnapshot } from '../api/client'
import {
  BUILDING_CONFIGS,
  SELECTED_UNIT_COLOR,
  STATUS_BY_ID,
  buildingEndingsForFloor,
  type ApartmentStatus,
  type BuildingKind,
} from '../config/building'
import {
  SOLAR_ILLUSTRATION_BY_ID,
  edgeLandmarksForBuilding,
} from '../config/surroundings'
import { BuildingScene, type BuildingView } from './BuildingScene'
import { EnvironmentOverlay } from './EnvironmentOverlay'
import { FloorPlanScene } from './FloorPlanScene'
import { SurroundingIcon } from './SurroundingIcon'
import { liveContractCode } from './liveBoard'

const VIEWS = new Set<BuildingView>([
  'perspective',
  'front',
  'back',
  'east',
  'west',
])

function isBuilding(value: string): value is BuildingKind {
  return value in BUILDING_CONFIGS
}

type Props = {
  onLogout: () => void
}

export function LiveScreen({ onLogout }: Props) {
  const [board, setBoard] = useState<LiveBoard | null>(null)
  const [snapshot, setSnapshot] = useState<MapSnapshot | null>(null)

  useEffect(() => {
    let active = true
    const loadBoard = () => {
      void api
        .liveBoard()
        .then((next) => {
          if (active) setBoard(next)
        })
        .catch(() => undefined)
    }
    const loadMap = () => {
      void api
        .map()
        .then((next) => {
          if (active) setSnapshot(next)
        })
        .catch(() => undefined)
    }
    loadBoard()
    loadMap()
    const boardTimer = window.setInterval(loadBoard, 1000)
    const mapTimer = window.setInterval(loadMap, 2000)
    return () => {
      active = false
      window.clearInterval(boardTimer)
      window.clearInterval(mapTimer)
    }
  }, [])

  const building =
    board && isBuilding(board.building) ? board.building : 'even'
  const config = BUILDING_CONFIGS[building]
  const code = liveContractCode(board?.associateCode ?? '')
  const focus = board?.focusApartment ?? ''
  const apartment = config.apartmentById[focus]
  const view = VIEWS.has(board?.view as BuildingView)
    ? (board?.view as BuildingView)
    : 'perspective'
  const sceneTheme = board?.sceneTheme === 'light' ? 'light' : 'dark'
  const highlight = board?.highlightAvailability !== false
  const statuses: Record<string, ApartmentStatus> = {}
  if (snapshot) {
    for (const [storageId, status] of Object.entries(snapshot.statuses)) {
      const [kind, id] = storageId.split(':')
      if (kind === building && id && status) statuses[id] = status
    }
  }
  const landmarks = snapshot
    ? edgeLandmarksForBuilding(snapshot.edgeLandmarks, building)
    : []
  const activeLandmarks =
    snapshot && apartment
      ? (snapshot.edgeLandmarks[building]?.[apartment.ending] ?? [])
      : undefined
  const solar =
    snapshot && apartment
      ? (snapshot.solarIllustrations[building]?.[apartment.ending] ?? [])
      : []
  const showPlan = Boolean(apartment && config.floorModel)
  const modelUrl =
    apartment?.floor === 0 && config.groundFloorModel
      ? config.groundFloorModel
      : config.floorModel

  return (
    <div className="live-stage">
      <header className="live-stage-bar">
        <span className="live-on-air">Ao vivo</span>
        <div className="live-stage-event">
          <b>{config.label}</b>
          {board && <small>Grupo {board.drawGroup}</small>}
        </div>
        <div className="live-plaque" aria-live="polite">
          <span>Sorteio</span>
          <strong>{code || 'Aguardando'}</strong>
        </div>
        <button type="button" className="ghost-button" onClick={onLogout}>
          <LogOut size={16} /> Sair
        </button>
      </header>

      <section
        className={`viewer-card ${sceneTheme === 'light' ? 'is-scene-light' : ''}`}
      >
        <div className={`canvas-wrap ${showPlan ? 'split-canvas' : ''}`}>
          <div className="tower-view">
            <BuildingScene
              config={config}
              statuses={statuses}
              selectedId={apartment?.id ?? ''}
              activeStatus={statuses[apartment?.id ?? ''] ?? 'none'}
              view={view}
              showFloorScale
              highlightAvailability={highlight}
              sceneTheme={sceneTheme}
              onSelect={() => undefined}
              onActivate={() => undefined}
            />
            {landmarks.length > 0 && !showPlan ? (
              <EnvironmentOverlay
                landmarks={landmarks}
                activeLandmarks={activeLandmarks}
              />
            ) : (
              <div className="orientation-badge">
                <span>N</span>
                <i />
              </div>
            )}
            {highlight && (
              <div className="availability-legend">
                <span>
                  <i
                    style={
                      {
                        '--legend-color': STATUS_BY_ID.available.color,
                      } as CSSProperties
                    }
                  />
                  Disponível
                </span>
                <span>
                  <i
                    style={
                      { '--legend-color': SELECTED_UNIT_COLOR } as CSSProperties
                    }
                  />
                  Selecionado
                </span>
                <span>
                  <KeyRound size={12} className="legend-key" aria-hidden="true" />
                  <i
                    style={
                      {
                        '--legend-color': STATUS_BY_ID.reserved.color,
                      } as CSSProperties
                    }
                  />
                  Reservado
                </span>
              </div>
            )}
          </div>
          {showPlan && apartment && (
            <div className="floor-plan-view">
              <div className="floor-plan-heading">
                <div>
                  <span>Planta ampliada</span>
                  <strong>
                    {apartment.floor === 0
                      ? 'Térreo'
                      : `${apartment.floor}º andar`}
                  </strong>
                </div>
              </div>
              <FloorPlanScene
                config={config}
                floor={apartment.floor}
                selectedId={apartment.id}
                statuses={statuses}
                modelUrl={modelUrl}
                endings={buildingEndingsForFloor(config, apartment.floor)}
                highlightAvailability={highlight}
                sceneTheme={sceneTheme}
                onSelect={() => undefined}
                onActivate={() => undefined}
              />
              {landmarks.length > 0 && (
                <EnvironmentOverlay
                  variant="plan"
                  landmarks={landmarks}
                  activeLandmarks={activeLandmarks}
                />
              )}
              {solar.length > 0 && (
                <div className="canvas-solar-stack">
                  {solar.map((illustration) => {
                    const option = SOLAR_ILLUSTRATION_BY_ID[illustration]
                    if (!option) return null
                    return (
                      <figure
                        className="solar-illustration-card canvas-solar-card"
                        key={illustration}
                      >
                        <img src={option.image} alt={option.label} />
                        <figcaption>
                          <SurroundingIcon icon={option.icon} size={13} />
                          <span>
                            <b>{option.label}</b>
                            <small>Final {apartment.ending}</small>
                          </span>
                        </figcaption>
                      </figure>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
