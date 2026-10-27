import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Building2,
  Check,
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
  apartmentId,
  buildingEndingsForFloor,
  buildingFloors,
  type ApartmentStatus,
} from '../config/building'
import { floorIsComplete } from './ApartmentGrid'
import {
  describeDrawApartment,
  drawBoardStats,
  drawBoardSubtitle,
  drawUnitPresentation,
} from './associateDrawBoard'
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
  const liveStageRef = useRef<HTMLDivElement | null>(null)

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

  return (
    <section className="draw-board" aria-label="Painel da escolha de apartamentos">
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
        <div className="draw-grid" aria-label="Apartamentos por andar">
          <div
            className="draw-grid-row is-head"
            style={{ gridTemplateColumns: gridColumns }}
          >
            <span>Andar</span>
            {endings.map((ending) => (
              <span key={ending}>Final {ending}</span>
            ))}
          </div>
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
                      {cell.text}
                    </span>
                  )
                })}
              </div>
            )
          })}
          </div>
        </div>

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
            <strong>{currentCode || 'Aguardando'}</strong>
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
                    <b>{item.code}</b>
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
        </aside>
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
