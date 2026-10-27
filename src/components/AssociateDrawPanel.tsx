import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import {
  Building2,
  Check,
  KeyRound,
  Layers3,
  List,
  Lock,
  Maximize,
  Minimize,
  Radio,
  UserRound,
  X,
} from 'lucide-react'
import { api, type AssociateDrawSnapshot } from '../api/client'
import {
  BUILDING_CONFIGS,
  SELECTED_UNIT_COLOR,
  STATUS_BY_ID,
  apartmentId,
  buildingEndingsForFloor,
  buildingFloors,
  type ApartmentStatus,
} from '../config/building'
import {
  DEFAULT_EDGE_LANDMARKS,
  DEFAULT_SOLAR_ILLUSTRATIONS,
  SOLAR_ILLUSTRATION_BY_ID,
  edgeLandmarksForBuilding,
} from '../config/surroundings'
import { floorIsComplete } from './ApartmentGrid'
import { BuildingScene, type BuildingView } from './BuildingScene'
import { EnvironmentOverlay } from './EnvironmentOverlay'
import { FloorPlanScene } from './FloorPlanScene'
import { SurroundingIcon } from './SurroundingIcon'
import {
  describeDrawApartment,
  drawBoardStats,
  drawBoardSubtitle,
  drawUnitPresentation,
} from './associateDrawBoard'
import { ContractDigits } from './contractDigits'
import { liveContractCode } from './liveBoard'

const clockFormat = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'short',
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

const timeFormat = new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

const PRESENTATIONS = [
  { id: 'list', label: 'Lista' },
  { id: 'tower', label: 'Prédio 3D' },
  { id: 'floor', label: 'Andar 3D' },
] as const

const TOWER_VIEWS: Array<{ id: BuildingView; label: string }> = [
  { id: 'perspective', label: '3D' },
  { id: 'front', label: 'Frente' },
  { id: 'back', label: 'Fundos' },
  { id: 'east', label: 'Leste' },
  { id: 'west', label: 'Oeste' },
]

type Presentation = (typeof PRESENTATIONS)[number]['id']

function sourceLabel(source: AssociateDrawSnapshot['source']) {
  if (source === 'anticipator') return 'Antecipador'
  if (source === 'draw') return 'Sorteio'
  return 'Aguardando'
}

export function AssociateDrawPanel({
  embedSrc = null,
  liveUrl = '',
}: {
  embedSrc?: string | null
  liveUrl?: string
}) {
  const [board, setBoard] = useState<AssociateDrawSnapshot | null>(null)
  const [now, setNow] = useState(() => new Date())
  const [liveFullscreen, setLiveFullscreen] = useState(false)
  const [callPulse, setCallPulse] = useState(0)
  const [presentation, setPresentation] = useState<Presentation>('list')
  const [towerView, setTowerView] = useState<BuildingView>('front')
  const liveStageRef = useRef<HTMLDivElement | null>(null)
  const seenCode = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = () => {
      void api
        .portalDrawBoard()
        .then((data) => {
          if (!cancelled) setBoard(data)
        })
        .catch(() => undefined)
    }
    load()
    const timer = window.setInterval(load, 1000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const onChange = () => {
      setLiveFullscreen(document.fullscreenElement === liveStageRef.current)
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const config = board ? BUILDING_CONFIGS[board.building] : null
  const reservedById = useMemo(() => {
    const map = new Map<string, string>()
    for (const item of board?.reserved ?? []) {
      const code = liveContractCode(item.code)
      if (code) map.set(item.apartmentId, code)
    }
    return map
  }, [board])
  const statuses = useMemo(() => {
    if (!config) return {}
    return Object.fromEntries(
      config.apartments.map((apartment) => [
        apartment.id,
        reservedById.has(apartment.id) ? 'reserved' : 'none',
      ]),
    ) as Record<string, ApartmentStatus>
  }, [config, reservedById])
  const stats = drawBoardStats({
    total: config?.apartments.length ?? 0,
    reserved: reservedById.size,
    declined: board?.declined.length ?? 0,
  })
  const currentCode = liveContractCode(board?.associateCode ?? '')
  const focus = board?.focusApartment ?? ''

  useEffect(() => {
    if (seenCode.current === null) {
      seenCode.current = currentCode
      return
    }
    if (seenCode.current === currentCode) return
    seenCode.current = currentCode
    setCallPulse((value) => value + 1)
  }, [currentCode])
  const focusReserved = Boolean(focus && reservedById.has(focus))
  const recent = useMemo(() => {
    const events = [
      ...(board?.reserved ?? []).map((item) => ({
        id: `reserved-${item.apartmentId}`,
        kind: 'defined' as const,
        code: liveContractCode(item.code),
        apartmentId: item.apartmentId,
        at: item.at,
      })),
      ...(board?.declined ?? []).map((item) => ({
        id: `declined-${item.code}-${item.at}`,
        kind: 'declined' as const,
        code: liveContractCode(item.code),
        apartmentId: '',
        at: item.at,
      })),
    ]
    return events
      .filter((item) => item.code)
      .sort((left, right) => right.at.localeCompare(left.at))
      .slice(0, 6)
  }, [board])
  const endings = config?.endings ?? []
  const floors = config ? [...buildingFloors(config)].reverse() : []
  const gridColumns = `52px repeat(${Math.max(endings.length, 1)}, minmax(0, 1fr))`
  const sceneApartment = config?.apartmentById[focus]
  const sceneFloor = sceneApartment?.floor ?? floors[0] ?? 1
  const sceneEndings = config ? buildingEndingsForFloor(config, sceneFloor) : []
  const landmarks = config
    ? edgeLandmarksForBuilding(DEFAULT_EDGE_LANDMARKS, config.kind)
    : []
  const activeLandmarks =
    config && sceneApartment
      ? DEFAULT_EDGE_LANDMARKS[config.kind]?.[sceneApartment.ending]
      : undefined
  const solar =
    config && sceneApartment
      ? (DEFAULT_SOLAR_ILLUSTRATIONS[config.kind]?.[sceneApartment.ending] ??
        [])
      : []

  return (
    <section className="draw-board is-vfx" aria-label="Painel da escolha de apartamentos">
      <header className="draw-board-top">
        <div>
          <p className="draw-board-kicker">
            <Radio size={14} /> Ao vivo
          </p>
          <h2>Painel de definição de apartamentos</h2>
          <p>
            {drawBoardSubtitle({
              title: board?.title ?? '',
              blockLabel: board?.blockLabel ?? '',
              drawGroup: board?.drawGroup ?? '',
            })}
          </p>
        </div>
        <div
          className="draw-view-switch"
          role="group"
          aria-label="Versão da visualização"
        >
          {PRESENTATIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={presentation === option.id ? 'active' : ''}
              aria-pressed={presentation === option.id}
              onClick={() => setPresentation(option.id)}
            >
              {option.id === 'list' && <List size={14} />}
              {option.id === 'tower' && <Building2 size={14} />}
              {option.id === 'floor' && <Layers3 size={14} />}
              {option.label}
            </button>
          ))}
        </div>
        <time dateTime={now.toISOString()}>{clockFormat.format(now)}</time>
      </header>

      <div className="draw-board-stats">
        <Stat icon={<Building2 size={16} />} value={stats.total} label="Unidades" />
        <Stat icon={<UserRound size={16} />} value={stats.calls} label="Chamadas" />
        <Stat value={stats.available} label="Disponíveis" tone="available" />
        <Stat value={stats.defined} label="Definidos" tone="defined" />
        <Stat value={stats.declined} label="Abdicados" tone="declined" />
        <Stat icon={<Lock size={16} />} value={stats.blocked} label="Bloqueados" />
      </div>

      <div className="draw-board-body">
        {presentation === 'list' ? (
        <div className="draw-grid" aria-label="Apartamentos por andar">
          <div className="draw-grid-scroll">
          {floors.map((floor) => {
            const floorIds =
              config?.apartments
                .filter((apartment) => apartment.floor === floor)
                .map((apartment) => apartment.id) ?? []
            const complete = floorIsComplete(floorIds, statuses)
            const rowEndings = config
              ? buildingEndingsForFloor(config, floor)
              : endings
            return (
              <div
                className="draw-grid-row"
                key={floor}
                style={{ gridTemplateColumns: gridColumns }}
              >
                <span
                  className={`draw-floor${complete ? ' is-complete' : ''}`}
                  title={complete ? 'Andar completo' : undefined}
                >
                  {String(floor).padStart(2, '0')}º
                </span>
                {endings.map((ending) => {
                  const id = apartmentId(floor, ending)
                  const exists =
                    rowEndings.includes(ending) &&
                    Boolean(config?.apartmentById[id])
                  const cell = drawUnitPresentation({
                    exists,
                    unitId: id,
                    reservedCode: reservedById.get(id) ?? '',
                    currentCode,
                    focused: id === focus,
                  })
                  return (
                    <span
                      key={id}
                      className={`draw-unit is-${cell.state}${id === focus ? ' is-focus' : ''}`}
                    >
                      {cell.state === 'current' ? (
                        <ContractDigits code={cell.text} />
                      ) : (
                        cell.text
                      )}
                    </span>
                  )
                })}
              </div>
            )
          })}
          </div>
          <div
            className="draw-finals draw-grid-row is-head"
            style={{ gridTemplateColumns: gridColumns }}
          >
            <span>Andar</span>
            {endings.map((ending) => (
              <span key={ending}>Final {ending}</span>
            ))}
          </div>
        </div>
        ) : (
          <div className="draw-scene" aria-label={presentation === 'tower' ? 'Prédio em 3D' : 'Andar em 3D'}>
            {presentation === 'tower' && (
              <div className="draw-scene-views view-tabs" role="group" aria-label="Face do prédio">
                {TOWER_VIEWS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={towerView === option.id ? 'active' : ''}
                    onClick={() => setTowerView(option.id)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
            <div className="canvas-wrap">
              {presentation === 'tower' && config ? (
                <div className="tower-view">
                  <BuildingScene
                    config={config}
                    statuses={statuses}
                    selectedId={sceneApartment?.id ?? ''}
                    activeStatus={statuses[sceneApartment?.id ?? ''] ?? 'none'}
                    view={towerView}
                    showFloorScale
                    highlightAvailability
                    sceneTheme="dark"
                    onSelect={() => undefined}
                    onActivate={() => undefined}
                  />
                  <div className="orientation-badge">
                    <span>N</span>
                    <i />
                  </div>
                  <div className="scene-counter">
                    <Layers3 size={15} />
                    <span>{config.floorCount} andares</span>
                    <b>·</b>
                    <span>{config.apartments.length} unidades</span>
                  </div>
                  <div className="availability-legend">
                    <span>
                      <i
                        style={
                          {
                            '--legend-color':
                              config.kind === 'even'
                                ? '#8FCB9F'
                                : STATUS_BY_ID.available.color,
                          } as CSSProperties
                        }
                      />
                      Disponível
                    </span>
                    <span>
                      <i style={{ '--legend-color': SELECTED_UNIT_COLOR } as CSSProperties} />
                      Selecionado
                    </span>
                    <span>
                      <KeyRound size={12} className="legend-key" aria-hidden="true" />
                      <i style={{ '--legend-color': STATUS_BY_ID.reserved.color } as CSSProperties} />
                      Reservado
                    </span>
                  </div>
                </div>
              ) : config?.floorModel ? (
                <div className="floor-plan-view">
                  <div className="floor-plan-heading">
                    <div>
                      <span>Planta ampliada</span>
                      <strong>
                        {sceneFloor === 0 ? 'Térreo' : `${sceneFloor}º andar`}
                      </strong>
                    </div>
                    <small>
                      {sceneApartment
                        ? `Apartamento ${sceneApartment.id}`
                        : 'Aguardando a escolha'}
                    </small>
                  </div>
                  <FloorPlanScene
                    config={config}
                    floor={sceneFloor}
                    selectedId={sceneApartment?.id ?? ''}
                    statuses={statuses}
                    modelUrl={
                      sceneFloor === 0 && config.groundFloorModel
                        ? config.groundFloorModel
                        : config.floorModel
                    }
                    endings={sceneEndings}
                    highlightAvailability
                    sceneTheme="dark"
                    onSelect={() => undefined}
                    onActivate={() => undefined}
                  />
                  <EnvironmentOverlay
                    variant="plan"
                    showLabels={landmarks.length > 0}
                    landmarks={landmarks}
                    activeLandmarks={activeLandmarks}
                  />
                  {solar.length > 0 && (
                    <div className="canvas-solar-stack">
                      {solar.map((illustration) => {
                        const option = SOLAR_ILLUSTRATION_BY_ID[illustration]
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
                                <small>Final {sceneApartment?.ending}</small>
                              </span>
                            </figcaption>
                          </figure>
                        )
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <p className="draw-scene-empty">A planta 3D deste bloco ainda não está disponível.</p>
              )}
            </div>
          </div>
        )}

        <div className="draw-live">
            {embedSrc ? (
              <div className="portal-live-stage" ref={liveStageRef}>
                <iframe
                  title="Live do sorteio"
                  src={embedSrc}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                />
                <button
                  type="button"
                  className="portal-live-fullscreen"
                  onClick={() => {
                    const stage = liveStageRef.current
                    if (!stage) return
                    if (document.fullscreenElement === stage) {
                      void document.exitFullscreen()
                      return
                    }
                    void stage.requestFullscreen()
                  }}
                >
                  {liveFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
                  {liveFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
                </button>
              </div>
            ) : liveUrl ? (
              <a
                className="portal-button is-primary is-block"
                href={liveUrl}
                target="_blank"
                rel="noreferrer"
              >
                <Radio size={15} /> Abrir a live
              </a>
            ) : (
              <p>A live ainda não foi publicada.</p>
            )}
        </div>

        <aside className="draw-side">
          <article className="draw-current" aria-live="polite">
            <p>Chamada atual</p>
            <span className={`draw-source is-${board?.source ?? 'idle'}`}>
              {sourceLabel(board?.source ?? 'idle')}
            </span>
            <strong key={callPulse} className={callPulse > 0 ? 'is-arrived' : ''}>
              {currentCode ? <ContractDigits code={currentCode} /> : 'Aguardando'}
            </strong>
            <div className={`draw-focus${focus ? '' : ' is-empty'}`}>
              <b>{focus || '—'}</b>
              <span>
                {focus
                  ? describeDrawApartment(focus)
                  : 'O operador ainda não apontou um apartamento'}
              </span>
              <small>
                {focusReserved
                  ? 'Definido'
                  : focus
                    ? 'Aguardando confirmação'
                    : 'Aguardando a escolha'}
              </small>
            </div>
          </article>

          <article className="draw-legend">
            <ul>
              <li><i className="is-available" /> Disponível</li>
              <li><i className="is-current" /> Em chamada</li>
              <li><i className="is-defined" /> Definido</li>
              <li><i className="is-declined" /> Abdicado</li>
              <li><i className="is-blocked" /> Bloqueado</li>
            </ul>
          </article>

          <article className="draw-recent">
            <h3>Últimas chamadas</h3>
            {recent.length === 0 ? (
              <p>As escolhas aparecem aqui conforme o operador registra.</p>
            ) : (
              <ol>
                {recent.map((item) => (
                  <li key={item.id}>
                    <b>
                      <ContractDigits code={item.code} />
                    </b>
                    <span>
                      {item.apartmentId ? `Apto ${item.apartmentId}` : 'Abdicou'}
                    </span>
                    <time dateTime={item.at}>
                      {timeFormat.format(new Date(item.at))}
                    </time>
                    <em className={item.kind === 'defined' ? 'is-defined' : 'is-declined'}>
                      {item.kind === 'defined' ? <Check size={12} /> : <X size={12} />}
                      {item.kind === 'defined' ? 'Confirmado' : 'Abdicação'}
                    </em>
                  </li>
                ))}
              </ol>
            )}
          </article>
        </aside>
        <article className="draw-progress">
          <h3>Progresso · {stats.percent}%</h3>
          <div
            className="draw-meter"
            aria-label={`${stats.percent}% definido`}
          >
            <span style={{ width: `${stats.percent}%` }} />
          </div>
          <p>
            {stats.defined} definidos · {stats.declined} abdicados ·{' '}
            {stats.available} disponíveis
          </p>
        </article>
      </div>
    </section>
  )
}

function Stat({
  icon,
  value,
  label,
  tone,
}: {
  icon?: ReactNode
  value: number
  label: string
  tone?: 'available' | 'defined' | 'declined'
}) {
  return (
    <article className={`draw-stat${tone ? ` is-${tone}` : ''}`}>
      {icon}
      <b>{value}</b>
      <span>{label}</span>
    </article>
  )
}
