import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import {
  Building2,
  Check,
  ChevronDown,
  Compass,
  Download,
  Eye,
  FileText,
  Filter,
  Layers3,
  LogOut,
  RotateCcw,
  Settings,
  ShieldCheck,
  Ticket,
  Upload,
  X,
} from 'lucide-react'
import { getCurrentUser, logout, type AppUser } from './auth/localAuth'
import { api } from './api/client'
import { AdminPanel } from './components/AdminPanel'
import { ApartmentGrid } from './components/ApartmentGrid'
import { BuildingScene, type BuildingView } from './components/BuildingScene'
import { DeclinedDrawsPanel } from './components/DeclinedDrawsPanel'
import { EnvironmentOverlay } from './components/EnvironmentOverlay'
import { FloorPlanScene } from './components/FloorPlanScene'
import { LoginScreen } from './components/LoginScreen'
import { SurroundingIcon } from './components/SurroundingIcon'
import {
  BUILDING_CONFIGS,
  STATUS_BY_ID,
  STATUS_OPTIONS,
  apartmentId,
  apartmentStorageId,
  buildingEndingsForFloor,
  buildingFloors,
  type ApartmentStatus,
  type BuildingKind,
  type Ending,
} from './config/building'
import type { DrawDecline } from './config/drawDeclines'
import {
  SOLAR_ILLUSTRATION_BY_ID,
  type SolarIllustrationsConfig,
  type SurroundingsConfig,
} from './config/surroundings'
import {
  normalizeAssignments,
  normalizeStatuses,
  useApartmentStore,
  type ApartmentAssignments,
  type ApartmentStatuses,
  type AuditEvent,
} from './store/apartments'
import { generateBuildingPdf } from './utils/pdfReport'
import './styles.css'

const VIEW_OPTIONS: Array<{ id: BuildingView; label: string }> = [
  { id: 'perspective', label: '3D' },
  { id: 'front', label: 'Frente' },
  { id: 'back', label: 'Fundos' },
  { id: 'east', label: 'Leste' },
  { id: 'west', label: 'Oeste' },
]

function App() {
  const allStatuses = useApartmentStore((state) => state.statuses)
  const assignments = useApartmentStore((state) => state.assignments)
  const auditLog = useApartmentStore((state) => state.auditLog)
  const surroundings = useApartmentStore((state) => state.surroundings)
  const solarIllustrations = useApartmentStore(
    (state) => state.solarIllustrations,
  )
  const saveReservation = useApartmentStore((state) => state.saveReservation)
  const removeReservation = useApartmentStore(
    (state) => state.removeReservation,
  )
  const setSurroundings = useApartmentStore((state) => state.setSurroundings)
  const setSolarIllustration = useApartmentStore(
    (state) => state.setSolarIllustration,
  )
  const replaceData = useApartmentStore((state) => state.replaceData)

  const [authReady, setAuthReady] = useState(false)
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null)
  const [adminOpen, setAdminOpen] = useState(false)
  const [building, setBuilding] = useState<BuildingKind>('odd')
  const config = BUILDING_CONFIGS[building]
  const [selectedId, setSelectedId] = useState('361')
  const [view, setView] = useState<BuildingView>('perspective')
  const [floorPlanKind, setFloorPlanKind] = useState<'typical' | 'ground'>(
    'typical',
  )
  const [floorFilter, setFloorFilter] = useState<number | 'all'>('all')
  const [endingFilter, setEndingFilter] = useState<Ending | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<ApartmentStatus | 'all'>('all')
  const [notice, setNotice] = useState('')
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [pendingExisting, setPendingExisting] = useState(false)
  const [drawBall, setDrawBall] = useState('')
  const [participant, setParticipant] = useState('')
  const [justification, setJustification] = useState('')
  const [modalError, setModalError] = useState('')
  const [showEnvironment, setShowEnvironment] = useState(true)
  const [declines, setDeclines] = useState<DrawDecline[]>([])
  const [declineError, setDeclineError] = useState('')
  const [declineBusy, setDeclineBusy] = useState(false)
  const importInput = useRef<HTMLInputElement>(null)

  const refreshMap = async () => {
    const snapshot = await api.map()
    replaceData(
      snapshot.statuses as ApartmentStatuses,
      snapshot.assignments,
      snapshot.auditLog,
      snapshot.surroundings,
      snapshot.solarIllustrations,
    )
    setDeclines(snapshot.declines ?? [])
  }

  useEffect(() => {
    void getCurrentUser().then(async (user) => {
      setCurrentUser(user)
      if (user) {
        try {
          await refreshMap()
        } catch {
          setNotice('Não foi possível carregar os dados do servidor')
        }
      }
      setAuthReady(true)
    })
    // A hidratação acontece uma vez ao restaurar a sessão.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selectBuilding = (kind: BuildingKind) => {
    const nextConfig = BUILDING_CONFIGS[kind]
    setBuilding(kind)
    setSelectedId(apartmentId(nextConfig.floorCount, nextConfig.endings[0]))
    setFloorFilter('all')
    setEndingFilter('all')
    setStatusFilter('all')
    setView('perspective')
    setFloorPlanKind('typical')
  }

  const statuses = useMemo(
    () =>
      Object.fromEntries(
        config.apartments.map(({ id }) => [
          id,
          (allStatuses[apartmentStorageId(building, id)] ?? 'none') === 'none'
            ? 'none'
            : 'reserved',
        ]),
      ) as Record<string, ApartmentStatus>,
    [allStatuses, building, config.apartments],
  )

  const selectedApartment = config.apartmentById[selectedId]
  const selectedStatus = statuses[selectedId] ?? 'none'
  const selectedSolarIllustration = selectedApartment
    ? solarIllustrations[building][selectedApartment.ending]
    : undefined
  const showFloorPlan = Boolean(config.floorModel && selectedApartment)
  const isGroundPlan =
    Boolean(config.groundFloorModel) && floorPlanKind === 'ground'
  const floorPlanFloor = isGroundPlan
    ? 0
    : selectedApartment?.floor === 0
      ? 1
      : (selectedApartment?.floor ?? 1)
  const floorPlanEndings = buildingEndingsForFloor(config, floorPlanFloor)
  const floorPlanModel = isGroundPlan
    ? config.groundFloorModel
    : config.floorModel

  const counts = useMemo(
    () =>
      Object.fromEntries(
        STATUS_OPTIONS.map(({ id }) => [
          id,
          Object.values(statuses).filter((status) => status === id).length,
        ]),
      ) as Record<ApartmentStatus, number>,
    [statuses],
  )

  const filledCount = config.apartments.length - counts.none
  const progress = Math.round((filledCount / config.apartments.length) * 100)

  const showNotice = (message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 2600)
  }

  const selectApartment = (id: string) => {
    setSelectedId(id)
    const apartment = config.apartmentById[id]
    if (config.groundFloorModel && apartment) {
      setFloorPlanKind(apartment.floor === 0 ? 'ground' : 'typical')
    }
  }

  const requestApartment = (id: string) => {
    setSelectedId(id)
    const storageId = apartmentStorageId(building, id)
    const existing = assignments[storageId]
    setDrawBall(existing?.ball ?? '')
    setParticipant(existing?.participant ?? '')
    setJustification('')
    setModalError('')
    setPendingExisting(statuses[id] !== 'none')
    setPendingId(id)
  }

  const confirmApartment = async () => {
    if (!pendingId || !currentUser) return
    const storageId = apartmentStorageId(building, pendingId)
    const existingReservation = pendingExisting
    const ball = drawBall.trim()
    if (!ball) {
      setModalError('Informe o número da bolinha sorteada.')
      return
    }
    if (existingReservation && !justification.trim()) {
      setModalError('Informe a justificativa para alterar esta reserva.')
      return
    }
    const duplicate = Object.entries(assignments).find(
      ([id, assignment]) =>
        id.startsWith(`${building}:`) &&
        id !== storageId &&
        assignment.ball.trim().toLocaleLowerCase() ===
          ball.toLocaleLowerCase(),
    )
    if (duplicate) {
      setModalError(
        `A bolinha ${ball} já está vinculada ao apartamento ${duplicate[0].split(':')[1]}.`,
      )
      return
    }
    if (
      declines.some(
        (item) =>
          item.building === building &&
          item.ball.trim().toLocaleLowerCase() === ball.toLocaleLowerCase(),
      )
    ) {
      setModalError(
        'Esta bolinha está na lista de quem não aceitou o sorteio. Remova o registro antes de reservar.',
      )
      return
    }

    const wasEmpty = statuses[pendingId] === 'none'
    const input = {
      ball,
      participant: participant.trim(),
    }
    try {
      await api.saveReservation(building, pendingId, {
        ...input,
        reason: existingReservation ? justification.trim() : undefined,
      })
      setPendingId(null)
      saveReservation(
        storageId,
        input,
        currentUser.username,
        existingReservation ? justification.trim() : undefined,
      )
      showNotice(`Apartamento ${pendingId} reservado`)
      await refreshMap()
    } catch (error) {
      setModalError(
        error instanceof Error ? error.message : 'Não foi possível salvar.',
      )
      return
    }

    if (wasEmpty && filledCount + 1 === config.apartments.length) {
      window.setTimeout(() => {
        if (
          window.confirm(
            `${config.label} foram totalmente preenchidos. Deseja gerar o relatório PDF agora?`,
          )
        ) {
          void generateReport(
            {
              ...assignments,
              [storageId]: {
                ...input,
                assignedAt: new Date().toISOString(),
                createdBy: currentUser.username,
              },
            },
            { ...statuses, [pendingId]: 'reserved' },
          )
        }
      }, 200)
    }
  }

  const exportData = () => {
    const payload = JSON.stringify(
      {
        version: 3,
        project: 'evo-coop-live',
        exportedAt: new Date().toISOString(),
        statuses: allStatuses,
        assignments,
        auditLog,
        surroundings,
        solarIllustrations,
        declines,
      },
      null,
      2,
    )
    const url = URL.createObjectURL(
      new Blob([payload], { type: 'application/json;charset=utf-8' }),
    )
    const link = document.createElement('a')
    link.href = url
    link.download = `evo-coop-live-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
    showNotice('Arquivo exportado')
  }

  const importData = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as {
        statuses?: unknown
        assignments?: unknown
        auditLog?: unknown
        surroundings?: unknown
        solarIllustrations?: unknown
      }
      const normalized = normalizeStatuses(parsed.statuses ?? parsed)
      const normalizedAssignments = normalizeAssignments(parsed.assignments)
      if (!normalized) throw new Error('Formato inválido')
      if (!normalizedAssignments) throw new Error('Sorteios inválidos')
      if (
        !window.confirm(
          'Importar este mapa substituirá os dados atuais do banco. Deseja continuar?',
        )
      ) {
        return
      }
      const importedSurroundings =
        parsed.surroundings &&
        typeof parsed.surroundings === 'object' &&
        !Array.isArray(parsed.surroundings)
          ? (parsed.surroundings as SurroundingsConfig)
          : surroundings
      const importedSolarIllustrations =
        parsed.solarIllustrations &&
        typeof parsed.solarIllustrations === 'object' &&
        !Array.isArray(parsed.solarIllustrations)
          ? (parsed.solarIllustrations as SolarIllustrationsConfig)
          : solarIllustrations
      await api.importMap({
        statuses: normalized as ApartmentStatuses,
        assignments: normalizedAssignments as ApartmentAssignments,
        auditLog: (Array.isArray(parsed.auditLog)
          ? parsed.auditLog
          : []) as AuditEvent[],
        surroundings: importedSurroundings,
        solarIllustrations: importedSolarIllustrations,
      })
      replaceData(
        normalized as ApartmentStatuses,
        normalizedAssignments as ApartmentAssignments,
        (Array.isArray(parsed.auditLog) ? parsed.auditLog : []) as AuditEvent[],
        importedSurroundings,
        importedSolarIllustrations,
      )
      showNotice('Mapa importado com sucesso')
    } catch {
      showNotice('Não foi possível importar o arquivo')
    } finally {
      if (importInput.current) importInput.current.value = ''
    }
  }

  const generateReport = async (
    reportAssignments: ApartmentAssignments = assignments,
    reportStatuses: Record<string, ApartmentStatus> = statuses,
  ) => {
    try {
      await generateBuildingPdf({
        config,
        statuses: reportStatuses,
        assignments: reportAssignments,
        auditLog,
        surroundings,
        declines,
      })
      showNotice('Relatório PDF gerado')
    } catch {
      showNotice('Não foi possível gerar o relatório')
    }
  }

  if (!authReady) {
    return <div className="auth-loading">Carregando acesso…</div>
  }

  if (!currentUser) {
    return (
      <LoginScreen
        onLogin={(user) => {
          setCurrentUser(user)
          void refreshMap().catch(() =>
            showNotice('Não foi possível carregar os dados do servidor'),
          )
        }}
      />
    )
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">
            <Building2 size={20} strokeWidth={2.2} />
          </span>
          <div>
            <strong>Evo Coop Live</strong>
            <span>Mapa comercial interativo</span>
          </div>
        </div>

        <div className="building-switch" aria-label="Tipo de grupo">
          {(Object.keys(BUILDING_CONFIGS) as BuildingKind[]).map((kind) => (
            <button
              key={kind}
              type="button"
              className={building === kind ? 'active' : ''}
              onClick={() => selectBuilding(kind)}
            >
              <Building2 size={14} />
              <span>{BUILDING_CONFIGS[kind].label}</span>
              <small>{BUILDING_CONFIGS[kind].description}</small>
            </button>
          ))}
        </div>

        <div className="header-summary" aria-label="Resumo do mapa">
          <div>
            <span>Preenchimento</span>
            <strong>
              {filledCount} <small>/ {config.apartments.length}</small>
            </strong>
          </div>
          <div
            className="progress-ring"
            style={{ '--progress': `${progress * 3.6}deg` } as CSSProperties}
          >
            <span>{progress}%</span>
          </div>
        </div>

        <div className="file-actions">
          <div className="current-user" title={`Conectado como ${currentUser.username}`}>
            <span>{currentUser.username.slice(0, 1).toUpperCase()}</span>
            <div>
              <b>{currentUser.username}</b>
              <small>
                {currentUser.role === 'admin' ? 'Administrador' : 'Operador'}
              </small>
            </div>
          </div>
          {currentUser.role === 'admin' && (
            <button
              type="button"
              className="ghost-button"
              onClick={() => setAdminOpen(true)}
              title="Administração"
            >
              <Settings size={16} /> <span>Administrar</span>
            </button>
          )}
          <input
            ref={importInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void importData(file)
            }}
          />
          <button type="button" className="ghost-button data-button" onClick={() => importInput.current?.click()}>
            <Upload size={16} /> <span>Importar</span>
          </button>
          <button type="button" className="ghost-button data-button" onClick={exportData}>
            <Download size={16} /> <span>Exportar</span>
          </button>
          <button
            type="button"
            className="ghost-button report-button"
            onClick={() => void generateReport()}
          >
            <FileText size={16} /> <span>Gerar PDF</span>
          </button>
          <button
            type="button"
            className="ghost-button"
            onClick={() => {
              void logout().finally(() => setCurrentUser(null))
            }}
            title="Sair"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <main className="workspace">
        <section className="viewer-card" aria-label="Visualização 3D do edifício">
          <div className="viewer-toolbar">
            <div className="view-tabs">
              {VIEW_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={view === option.id ? 'active' : ''}
                  onClick={() => setView(option.id)}
                >
                  {option.id === 'perspective' && <RotateCcw size={14} />}
                  {option.label}
                </button>
              ))}
            </div>
            <div className="viewer-assists">
              <button
                type="button"
                className={`environment-toggle ${showEnvironment ? 'active' : ''}`}
                onClick={() => setShowEnvironment((visible) => !visible)}
                aria-pressed={showEnvironment}
              >
                <Compass size={14} /> Entorno
              </button>
              <span className="viewer-hint">
                <Eye size={14} /> Arraste para girar · role para zoom
              </span>
            </div>
          </div>

          <div className={`canvas-wrap ${showFloorPlan ? 'split-canvas' : ''}`}>
            <div className="tower-view">
              <BuildingScene
                config={config}
                statuses={statuses}
                selectedId={selectedId}
                activeStatus="reserved"
                view={view}
                onSelect={selectApartment}
                onActivate={requestApartment}
              />
              {showEnvironment && !showFloorPlan ? (
                <EnvironmentOverlay
                  showLabels={config.hasEnvironmentLabels}
                />
              ) : (
                <div className="orientation-badge">
                  <span>N</span>
                  <i />
                </div>
              )}
              <div className="scene-counter">
                <Layers3 size={15} />
                <span>{config.floorCount} andares</span>
                <b>·</b>
                <span>{config.apartments.length} unidades</span>
              </div>
            </div>
            {showFloorPlan && selectedApartment && (
              <div className="floor-plan-view">
                <div className="floor-plan-heading">
                  <div>
                    <span>Planta ampliada</span>
                    <strong>
                      {floorPlanFloor === 0
                        ? 'Térreo'
                        : `${floorPlanFloor}º andar`}
                    </strong>
                  </div>
                  <small>Clique em uma unidade</small>
                </div>
                {config.groundFloorModel && (
                  <div className="floor-plan-tabs" aria-label="Tipo de planta">
                    <button
                      type="button"
                      className={isGroundPlan ? 'active' : ''}
                      onClick={() => {
                        setFloorPlanKind('ground')
                        const ending =
                          selectedApartment.ending === 8
                            ? 1
                            : selectedApartment.ending
                        setSelectedId(apartmentId(0, ending))
                      }}
                    >
                      Térreo · 7 aptos
                    </button>
                    <button
                      type="button"
                      className={!isGroundPlan ? 'active' : ''}
                      onClick={() => {
                        setFloorPlanKind('typical')
                        const floor =
                          selectedApartment.floor === 0
                            ? 1
                            : selectedApartment.floor
                        setSelectedId(
                          apartmentId(floor, selectedApartment.ending),
                        )
                      }}
                    >
                      Pavimento · 8 aptos
                    </button>
                  </div>
                )}
                <FloorPlanScene
                  config={config}
                  floor={floorPlanFloor}
                  selectedId={selectedId}
                  statuses={statuses}
                  modelUrl={floorPlanModel}
                  endings={floorPlanEndings}
                  onSelect={selectApartment}
                  onActivate={requestApartment}
                />
                {showEnvironment && (
                  <EnvironmentOverlay
                    variant="plan"
                    showLabels={config.hasEnvironmentLabels}
                  />
                )}
              </div>
            )}
          </div>
        </section>

        <aside className="control-panel">
          <section className="panel-section palette-section">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Modo do sorteio</span>
                <h2>Reserva de apartamentos</h2>
              </div>
              <ShieldCheck size={21} className="reservation-shield" />
            </div>
            <div className="reservation-mode-card">
              <span className="color-swatch" style={{ '--status-color': STATUS_BY_ID.reserved.color } as CSSProperties}>
                <Check size={12} />
              </span>
              <div>
                <b>Reservado</b>
                <small>Clique para selecionar e confirme para registrar</small>
              </div>
              <strong>{counts.reserved}</strong>
            </div>
          </section>

          <DeclinedDrawsPanel
            items={declines.filter((item) => item.building === building)}
            busy={declineBusy}
            error={declineError}
            onAdd={async (input) => {
              setDeclineError('')
              if (!input.ball) {
                setDeclineError('Informe a bolinha sorteada.')
                return false
              }
              setDeclineBusy(true)
              try {
                const created = await api.addDecline({
                  building,
                  ...input,
                })
                setDeclines((current) => [created, ...current])
                showNotice(`Bolinha ${created.ball} registrada como não aceitou`)
                return true
              } catch (error) {
                setDeclineError(
                  error instanceof Error
                    ? error.message
                    : 'Não foi possível registrar.',
                )
                return false
              } finally {
                setDeclineBusy(false)
              }
            }}
            onRemove={async (id) => {
              setDeclineError('')
              setDeclineBusy(true)
              try {
                await api.removeDecline(id)
                setDeclines((current) =>
                  current.filter((item) => item.id !== id),
                )
                showNotice('Registro removido')
              } catch (error) {
                setDeclineError(
                  error instanceof Error
                    ? error.message
                    : 'Não foi possível remover.',
                )
              } finally {
                setDeclineBusy(false)
              }
            }}
          />

          <section className="panel-section selection-card">
            <span className="eyebrow">Unidade selecionada</span>
            <div className="selection-title">
              <div>
                <span>Apartamento</span>
                <strong>{selectedId}</strong>
              </div>
              <span
                className="status-chip"
                style={
                  {
                    '--status-color': STATUS_BY_ID[selectedStatus].color,
                  } as CSSProperties
                }
              >
                {STATUS_BY_ID[selectedStatus].label}
              </span>
            </div>
            <div className="selection-meta">
              <span>
                <b>
                  {selectedApartment?.floor === 0
                    ? 'Térreo'
                    : `${selectedApartment?.floor}º`}
                </b>{' '}
                {selectedApartment?.floor === 0 ? '' : 'andar'}
              </span>
              <span>
                <b>Final {selectedApartment?.ending}</b>{' '}
                {selectedApartment &&
                  config.unitPositions[selectedApartment.ending].shortLabel}
              </span>
            </div>
            {assignments[apartmentStorageId(building, selectedId)] && (
              <div className="draw-summary">
                <Ticket size={15} />
                <div>
                  <span>
                    Bolinha{' '}
                    <b>
                      {
                        assignments[apartmentStorageId(building, selectedId)]
                          .ball
                      }
                    </b>
                  </span>
                  {assignments[apartmentStorageId(building, selectedId)]
                    .participant && (
                    <small>
                      {
                        assignments[apartmentStorageId(building, selectedId)]
                          .participant
                      }
                    </small>
                  )}
                  <small className="assignment-author">
                    Incluído por{' '}
                    {
                      assignments[apartmentStorageId(building, selectedId)]
                        .createdBy
                    }
                    {assignments[apartmentStorageId(building, selectedId)]
                      .updatedBy &&
                      ` · Alterado por ${
                        assignments[apartmentStorageId(building, selectedId)]
                          .updatedBy
                      }`}
                  </small>
                </div>
              </div>
            )}
            {selectedApartment && (
              <div className="unit-indications">
                <span className="eyebrow">Características desta posição</span>
                <div className="unit-indication-tags">
                  {(surroundings[building][selectedApartment.ending] ?? []).map(
                    (item) => (
                      <span key={item.id}>
                        <SurroundingIcon icon={item.icon} size={14} />
                        {item.label}
                      </span>
                    ),
                  )}
                </div>
                {selectedSolarIllustration && (
                  <figure className="solar-illustration-card">
                    <img
                      src={
                        SOLAR_ILLUSTRATION_BY_ID[selectedSolarIllustration].image
                      }
                      alt={`${SOLAR_ILLUSTRATION_BY_ID[selectedSolarIllustration].label} no final ${selectedApartment.ending}`}
                    />
                    <figcaption>
                      <SurroundingIcon
                        icon={selectedSolarIllustration}
                        size={15}
                      />
                      <span>
                        <b>
                          {
                            SOLAR_ILLUSTRATION_BY_ID[selectedSolarIllustration]
                              .label
                          }
                        </b>
                        <small>
                          Ilustração da incidência solar · Final{' '}
                          {selectedApartment.ending}
                        </small>
                      </span>
                    </figcaption>
                  </figure>
                )}
              </div>
            )}
            <button
              type="button"
              className="register-draw-button"
              onClick={() => requestApartment(selectedId)}
            >
              <Ticket size={16} />
              {selectedStatus === 'none'
                ? 'Registrar sorteio desta unidade'
                : 'Alterar reserva desta unidade'}
            </button>
          </section>

          <section className="panel-section filters-section">
            <div className="section-heading compact">
              <h2>
                <Filter size={16} /> Filtros
              </h2>
              {(floorFilter !== 'all' ||
                endingFilter !== 'all' ||
                statusFilter !== 'all') && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setFloorFilter('all')
                    setEndingFilter('all')
                    setStatusFilter('all')
                  }}
                >
                  Limpar
                </button>
              )}
            </div>
            <div className="filter-row">
              <label>
                <span>Andar</span>
                <div className="select-wrap">
                  <select
                    value={floorFilter}
                    onChange={(event) =>
                      setFloorFilter(
                        event.target.value === 'all' ? 'all' : Number(event.target.value),
                      )
                    }
                  >
                    <option value="all">Todos</option>
                    {buildingFloors(config)
                      .reverse()
                      .map((floor) => (
                      <option key={floor} value={floor}>
                        {floor === 0 ? 'Térreo' : `${floor}º`}
                      </option>
                      ))}
                  </select>
                  <ChevronDown size={14} />
                </div>
              </label>
              <label>
                <span>Final</span>
                <div className="select-wrap">
                  <select
                    value={endingFilter}
                    onChange={(event) =>
                      setEndingFilter(
                        event.target.value === 'all'
                          ? 'all'
                          : (Number(event.target.value) as Ending),
                      )
                    }
                  >
                    <option value="all">Todos</option>
                    {config.endings.map((ending) => (
                      <option key={ending} value={ending}>
                        Final {ending}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} />
                </div>
              </label>
              <label>
                <span>Situação</span>
                <div className="select-wrap">
                  <select
                    value={statusFilter}
                    onChange={(event) =>
                      setStatusFilter(event.target.value as ApartmentStatus | 'all')
                    }
                  >
                    <option value="all">Todas</option>
                    {STATUS_OPTIONS.filter(
                      ({ id }) => id === 'none' || id === 'reserved',
                    ).map((status) => (
                      <option key={status.id} value={status.id}>
                        {status.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} />
                </div>
              </label>
            </div>
          </section>

          <ApartmentGrid
            config={config}
            statuses={statuses}
            selectedId={selectedId}
            floorFilter={floorFilter}
            endingFilter={endingFilter}
            statusFilter={statusFilter}
            onSelect={selectApartment}
            onActivate={requestApartment}
          />

        </aside>
      </main>

      {pendingId && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPendingId(null)
          }}
        >
          <section
            className="assignment-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="assignment-title"
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">
                  {pendingExisting ? 'Alterar reserva' : 'Confirmar escolha'}
                </span>
                <h2 id="assignment-title">Apartamento {pendingId}</h2>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setPendingId(null)}
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-unit-summary">
              <span>{config.label}</span>
              <b>
                {config.apartmentById[pendingId]?.floor}º andar · Final{' '}
                {config.apartmentById[pendingId]?.ending}
              </b>
            </div>

            <label className="modal-field">
              <span>Bolinha sorteada *</span>
              <input
                autoFocus
                value={drawBall}
                onChange={(event) => {
                  setDrawBall(event.target.value)
                  setModalError('')
                }}
                placeholder="Ex.: 127"
                onKeyDown={(event) => {
                  if (event.key === 'Enter') confirmApartment()
                }}
              />
            </label>

            <label className="modal-field">
              <span>Nome do sorteado</span>
              <input
                value={participant}
                onChange={(event) => setParticipant(event.target.value)}
                placeholder="Opcional"
              />
            </label>

            <div className="fixed-reservation-status">
              <span
                className="color-swatch"
                style={
                  {
                    '--status-color': STATUS_BY_ID.reserved.color,
                  } as CSSProperties
                }
              >
                <Check size={12} />
              </span>
              <span>
                <b>Reservado</b>
                <small>Única situação utilizada no sorteio</small>
              </span>
            </div>

            {pendingExisting && (
              <label className="modal-field justification-field">
                <span>Justificativa da alteração *</span>
                <textarea
                  value={justification}
                  onChange={(event) => {
                    setJustification(event.target.value)
                    setModalError('')
                  }}
                  placeholder="Explique por que os dados serão alterados ou removidos"
                  rows={3}
                />
              </label>
            )}

            {modalError && <p className="modal-error">{modalError}</p>}

            <div className="modal-actions">
              {pendingExisting && (
                <button
                  type="button"
                  className="danger-button"
                  onClick={() => {
                    if (!justification.trim()) {
                      setModalError(
                        'Informe a justificativa para remover esta reserva.',
                      )
                      return
                    }
                    void api
                      .removeReservation(
                        building,
                        pendingId,
                        justification.trim(),
                      )
                      .then(async () => {
                        setPendingId(null)
                        removeReservation(
                          apartmentStorageId(building, pendingId),
                          currentUser.username,
                          justification.trim(),
                        )
                        showNotice(
                          `Reserva do apartamento ${pendingId} removida`,
                        )
                        await refreshMap()
                      })
                      .catch((error: unknown) =>
                        setModalError(
                          error instanceof Error
                            ? error.message
                            : 'Não foi possível remover.',
                        ),
                      )
                  }}
                >
                  Remover reserva
                </button>
              )}
              <button
                type="button"
                className="secondary-button"
                onClick={() => setPendingId(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="confirm-button"
                onClick={confirmApartment}
              >
                <Check size={16} />
                {pendingExisting ? 'Salvar alteração' : 'Confirmar reserva'}
              </button>
            </div>
          </section>
        </div>
      )}

      {adminOpen && currentUser.role === 'admin' && (
        <AdminPanel
          surroundings={surroundings}
          solarIllustrations={solarIllustrations}
          onUpdate={async (kind, ending, items) => {
            setSurroundings(kind, ending, items)
            await api.updateSurroundings(kind, ending, items)
            await refreshMap()
          }}
          onSaveSolar={async (kind, ending, illustration) => {
            await api.updateSolarIllustration(kind, ending, illustration)
            setSolarIllustration(kind, ending, illustration)
            await refreshMap()
          }}
          onClose={() => setAdminOpen(false)}
        />
      )}

      {notice && <div className="toast">{notice}</div>}
    </div>
  )
}

export default App

