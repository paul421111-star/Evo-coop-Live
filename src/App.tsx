import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import {
  Building2,
  Check,
  ChevronDown,
  Compass,
  Eye,
  FileText,
  Filter,
  KeyRound,
  Layers3,
  LogOut,
  Maximize2,
  MessagesSquare,
  Minimize2,
  Palette,
  RotateCcw,
  Ruler,
  Settings,
  ShieldCheck,
  Ticket,
  Trophy,
  Kanban,
  X,
} from 'lucide-react'
import { getCurrentUser, logout, type AppUser } from './auth/localAuth'
import { api } from './api/client'
import { AdminPanel } from './components/AdminPanel'
import { AnticipationPanel } from './components/AnticipationPanel'
import { ApartmentGrid } from './components/ApartmentGrid'
import { BuildingScene, type BuildingView } from './components/BuildingScene'
import { DeclinedDrawsPanel } from './components/DeclinedDrawsPanel'
import { EnvironmentOverlay } from './components/EnvironmentOverlay'
import { EventWorkspacePicker } from './components/EventWorkspacePicker'
import { FloorPlanScene } from './components/FloorPlanScene'
import { LoginScreen } from './components/LoginScreen'
import { RankingBoard } from './components/RankingBoard'
import { CobrancaDesk } from './components/CobrancaDesk'
import { IssueDesk } from './components/IssueDesk'
import { SiteFooter } from './components/SiteFooter'
import { SurroundingIcon } from './components/SurroundingIcon'
import { TurnSign } from './components/TurnSign'
import {
  BUILDING_CONFIGS,
  SELECTED_UNIT_COLOR,
  STATUS_BY_ID,
  STATUS_OPTIONS,
  apartmentId,
  apartmentStorageId,
  buildingEndingsForFloor,
  buildingFloors,
  viewForEnding,
  type ApartmentStatus,
  type BuildingKind,
  type Ending,
} from './config/building'
import type { DrawDecline } from './config/drawDeclines'
import type {
  AnticipationEntryInput,
  AnticipationSession,
  AnticipationSessionInput,
} from './config/anticipation'
import {
  buildAssociateCode,
  drawGroupsForBuilding,
  nextDrawGroup,
  parseAssociateCode,
  type DrawGroup,
} from './config/drawGroups'
import {
  PROJECTS,
  liveEventTitle,
  projectForBuilding,
  type EventWorkspace,
} from './config/eventWorkspace'
import {
  SOLAR_ILLUSTRATION_BY_ID,
  edgeLandmarksForBuilding,
} from './config/surroundings'
import {
  useApartmentStore,
  type ApartmentAssignments,
  type ApartmentStatuses,
} from './store/apartments'
import { generateBuildingPdf } from './utils/pdfReport'
import './styles.css'

type Screen = 'sorteio' | 'ranking' | 'cobranca'

const RANKING_PATH = '/ranking'
const MAP_PATH = '/sorteio'
const COBRANCA_PATH = '/cobranca'

function screenFromPath(pathname: string): Screen {
  if (pathname.startsWith(COBRANCA_PATH)) return 'cobranca'
  if (pathname.startsWith(RANKING_PATH)) return 'ranking'
  return 'sorteio'
}

const initialScreen: Screen = screenFromPath(window.location.pathname)

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
  const edgeLandmarks = useApartmentStore((state) => state.edgeLandmarks)
  const saveReservation = useApartmentStore((state) => state.saveReservation)
  const removeReservation = useApartmentStore(
    (state) => state.removeReservation,
  )
  const setSurroundings = useApartmentStore((state) => state.setSurroundings)
  const setSolarIllustrations = useApartmentStore(
    (state) => state.setSolarIllustrations,
  )
  const setEdgeLandmarks = useApartmentStore((state) => state.setEdgeLandmarks)
  const replaceData = useApartmentStore((state) => state.replaceData)

  const [authReady, setAuthReady] = useState(false)
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null)
  const canViewAnticipation = currentUser?.role !== 'operator_obra'
  const [eventWorkspace, setEventWorkspace] =
    useState<EventWorkspace | null>(null)
  const [confirmEventSwitch, setConfirmEventSwitch] = useState(false)
  const [screen, setScreen] = useState<Screen>(initialScreen)
  const [adminOpen, setAdminOpen] = useState(false)
  const [building, setBuilding] = useState<BuildingKind>('odd')
  const [activeDrawGroups, setActiveDrawGroups] = useState<
    Record<BuildingKind, DrawGroup>
  >(() => {
    try {
      const saved = JSON.parse(
        window.localStorage.getItem('evo-coop-active-draw-groups') ?? '{}',
      ) as Partial<Record<BuildingKind, DrawGroup>>
      return {
        odd: drawGroupsForBuilding('odd').includes(saved.odd as DrawGroup)
          ? (saved.odd as DrawGroup)
          : '13',
        even: drawGroupsForBuilding('even').includes(saved.even as DrawGroup)
          ? (saved.even as DrawGroup)
          : '12',
        'jardim-artes': '11',
        'cond-iracema': '19',
      }
    } catch {
      return {
        odd: '13',
        even: '12',
        'jardim-artes': '11',
        'cond-iracema': '19',
      }
    }
  })
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
  const [showFloorScale, setShowFloorScale] = useState(true)
  const [showAvailability, setShowAvailability] = useState(true)
  const [declines, setDeclines] = useState<DrawDecline[]>([])
  const [declineError, setDeclineError] = useState('')
  const [declineBusy, setDeclineBusy] = useState(false)
  const [presenting, setPresenting] = useState(false)
  const [issueBoardOpen, setIssueBoardOpen] = useState(false)
  const [anticipationSession, setAnticipationSession] =
    useState<AnticipationSession | null>(null)
  const [anticipationBusy, setAnticipationBusy] = useState(false)
  const [turnBusy, setTurnBusy] = useState(false)
  const [anticipationError, setAnticipationError] = useState('')

  const refreshMap = async () => {
    const snapshot = await api.map()
    replaceData(
      snapshot.statuses as ApartmentStatuses,
      snapshot.assignments,
      snapshot.auditLog,
      snapshot.surroundings,
      snapshot.solarIllustrations,
      snapshot.edgeLandmarks,
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

  useEffect(() => {
    window.localStorage.setItem(
      'evo-coop-active-draw-groups',
      JSON.stringify(activeDrawGroups),
    )
  }, [activeDrawGroups])

  useEffect(() => {
    const sync = () => {
      setScreen(screenFromPath(window.location.pathname))
    }
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])

  const goToScreen = (next: Screen) => {
    setScreen(next)
    window.history.pushState(
      {},
      '',
      next === 'ranking'
        ? RANKING_PATH
        : next === 'cobranca'
          ? COBRANCA_PATH
          : MAP_PATH,
    )
  }

  // A tela cheia do navegador pode ser negada (ou nem existir no host); nesse
  // caso o modo apresentação segue valendo apenas escondendo o cabeçalho.
  const enterPresentation = async () => {
    setPresenting(true)
    await document.documentElement
      .requestFullscreen?.()
      .catch(() => undefined)
  }

  const exitPresentation = async () => {
    setPresenting(false)
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => undefined)
    }
  }

  useEffect(() => {
    const syncFullscreen = () => {
      if (!document.fullscreenElement) setPresenting(false)
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPresenting(false)
    }
    document.addEventListener('fullscreenchange', syncFullscreen)
    window.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreen)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [])

  const selectBuilding = (kind: BuildingKind) => {
    const nextConfig = BUILDING_CONFIGS[kind]
    setBuilding(kind)
    setSelectedId(apartmentId(nextConfig.floorCount, nextConfig.endings[0]))
    setFloorFilter('all')
    setEndingFilter('all')
    setStatusFilter('all')
    setView(viewForEnding(nextConfig, nextConfig.endings[0]))
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
  const drawGroups = drawGroupsForBuilding(building)
  const activeDrawGroup = activeDrawGroups[building]
  const refreshAnticipation = async () => {
    const session = await api.currentAnticipationSession(
      building,
      activeDrawGroup,
    )
    setAnticipationSession(session)
  }

  useEffect(() => {
    if (!currentUser || !eventWorkspace || !canViewAnticipation) return
    void api
      .currentAnticipationSession(building, activeDrawGroup)
      .then(setAnticipationSession)
      .catch(() => {
        setAnticipationSession(null)
        setAnticipationError('Não foi possível carregar o ranking.')
      })
  }, [
    building,
    activeDrawGroup,
    currentUser,
    eventWorkspace,
    canViewAnticipation,
  ])

  useEffect(() => {
    if (
      !currentUser ||
      !eventWorkspace ||
      !canViewAnticipation ||
      anticipationSession?.status !== 'draft'
    )
      return
    const timer = window.setInterval(() => {
      void api
        .currentAnticipationSession(building, activeDrawGroup)
        .then(setAnticipationSession)
        .catch(() => undefined)
    }, 4000)
    return () => window.clearInterval(timer)
  }, [
    anticipationSession?.status,
    activeDrawGroup,
    building,
    currentUser,
    eventWorkspace,
    canViewAnticipation,
  ])

  const selectedStatus = statuses[selectedId] ?? 'none'
  const selectedSolarIllustrations = (() => {
    if (!selectedApartment) return []
    const raw = solarIllustrations[building][selectedApartment.ending]
    if (Array.isArray(raw)) return raw
    return raw ? [raw] : []
  })()
  const selectedEdgeLandmarks = selectedApartment
    ? (edgeLandmarks[building][selectedApartment.ending] ?? [])
    : []
  const buildingEdgeLandmarks = edgeLandmarksForBuilding(
    edgeLandmarks,
    building,
  )
  const showFloorPlan = Boolean(config.floorModel && selectedApartment)
  const solarCards =
    selectedApartment && selectedSolarIllustrations.length > 0 ? (
      <div className="canvas-solar-stack">
        {selectedSolarIllustrations.map((illustration) => {
          const option = SOLAR_ILLUSTRATION_BY_ID[illustration]
          return (
            <figure
              className="solar-illustration-card canvas-solar-card"
              key={illustration}
            >
              <img
                src={option.image}
                alt={`${option.label} no final ${selectedApartment.ending}`}
              />
              <figcaption>
                <SurroundingIcon icon={option.icon} size={13} />
                <span>
                  <b>{option.label}</b>
                  <small>Final {selectedApartment.ending}</small>
                </span>
              </figcaption>
            </figure>
          )
        })}
      </div>
    ) : null
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
  const buildingDeclines = declines.filter(
    (item) => item.building === building,
  )
  const anticipatorDeclines = buildingDeclines.filter(
    (item) => item.source === 'anticipator',
  ).length
  const drawDeclines = buildingDeclines.length - anticipatorDeclines

  const showNotice = (message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 2600)
  }

  const selectApartment = (id: string) => {
    setSelectedId(id)
    const apartment = config.apartmentById[id]
    if (apartment) setView(viewForEnding(config, apartment.ending))
    if (config.groundFloorModel && apartment) {
      setFloorPlanKind(apartment.floor === 0 ? 'ground' : 'typical')
    }
  }

  const requestApartment = (id: string) => {
    setSelectedId(id)
    const apartment = config.apartmentById[id]
    if (apartment) setView(viewForEnding(config, apartment.ending))
    const storageId = apartmentStorageId(building, id)
    const existing = assignments[storageId]
    const parsed = existing
      ? parseAssociateCode(building, existing.ball)
      : null
    if (parsed) {
      setActiveDrawGroups((current) => ({
        ...current,
        [building]: parsed.group,
      }))
    }
    const nextAnticipator =
      !existing &&
      anticipationSession?.status === 'active' &&
      anticipationSession.nextSource === 'anticipator'
        ? anticipationSession.nextAnticipator
        : null
    setDrawBall(
      nextAnticipator
        ? activeDrawGroup
          ? nextAnticipator.associateCode.slice(-4)
          : nextAnticipator.associateCode
        : (parsed?.ball ?? existing?.ball ?? ''),
    )
    setParticipant(
      nextAnticipator?.participant ?? existing?.participant ?? '',
    )
    setJustification('')
    setModalError('')
    setPendingExisting(statuses[id] !== 'none')
    setPendingId(id)
  }

  const confirmApartment = async () => {
    if (!pendingId || !currentUser) return
    const storageId = apartmentStorageId(building, pendingId)
    const existingReservation = pendingExisting
    const ball = activeDrawGroup
      ? buildAssociateCode(activeDrawGroup, drawBall)
      : drawBall.trim()
    if (!ball) {
      setModalError(
        activeDrawGroup
          ? 'Informe uma bolinha entre 1 e 9999.'
          : 'Informe o código do associado.',
      )
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
        'Esta bolinha está na Lista de Abdicação. Remova o registro antes de reservar.',
      )
      return
    }

    const wasEmpty = statuses[pendingId] === 'none'
    const input = {
      ball,
      participant: participant.trim(),
      choiceSource:
        anticipationSession?.status === 'active' && !existingReservation
          ? anticipationSession.nextSource
          : assignments[storageId]?.choiceSource,
    }
    try {
      await api.saveReservation(building, pendingId, {
        ...input,
        reason: existingReservation ? justification.trim() : undefined,
        anticipationSessionId:
          anticipationSession?.status === 'active' && !existingReservation
            ? anticipationSession.id
            : undefined,
        anticipationEntryId:
          anticipationSession?.status === 'active' &&
          anticipationSession.nextSource === 'anticipator' &&
          !existingReservation
            ? anticipationSession.nextAnticipator?.id
            : undefined,
      })
      setPendingId(null)
      saveReservation(
        storageId,
        input,
        currentUser.username,
        existingReservation ? justification.trim() : undefined,
      )
      showNotice(
        anticipationSession?.status === 'active' && !existingReservation
          ? `Apartamento ${pendingId} reservado. A plaquinha muda no botão Próximo.`
          : anticipationSession && anticipationSession.status !== 'active'
            ? `Apartamento ${pendingId} reservado · a vez só alterna depois de iniciar a escolha no ranking`
            : `Apartamento ${pendingId} reservado`,
      )
      await refreshMap()
      await refreshAnticipation()
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

  const advanceTurn = async () => {
    if (!anticipationSession?.awaitingNext || turnBusy) return
    setTurnBusy(true)
    try {
      const session = await api.advanceAnticipationTurn(anticipationSession.id)
      setAnticipationSession(session)
      showNotice(
        session.nextSource === 'anticipator'
          ? 'Plaquinha atualizada: vez do antecipador.'
          : 'Plaquinha atualizada: vez do sorteio.',
      )
    } catch (error) {
      showNotice(
        error instanceof Error
          ? error.message
          : 'Não foi possível passar para o próximo.',
      )
    } finally {
      setTurnBusy(false)
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
        edgeLandmarks,
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

  if (!eventWorkspace) {
    return (
      <>
        <EventWorkspacePicker
          onConfirm={(workspace) => {
            selectBuilding(workspace.building)
            setActiveDrawGroups((current) => ({
              ...current,
              [workspace.building]: workspace.group,
            }))
            setAnticipationSession(null)
            setAnticipationError('')
            setEventWorkspace(workspace)
          }}
        />
        <IssueDesk
          admin={currentUser.role === 'admin'}
          place="Seleção do evento"
          boardOpen={issueBoardOpen}
          onBoardOpen={setIssueBoardOpen}
        />
      </>
    )
  }

  const activeProject =
    PROJECTS.find(
      (project) => project.id === projectForBuilding(eventWorkspace.building),
    ) ?? PROJECTS[0]
  const eventTitle = liveEventTitle(
    activeDrawGroup ?? eventWorkspace.group,
    eventWorkspace.block,
  )

  const anticipationActions = {
    onCreate: async (input: AnticipationSessionInput) => {
      setAnticipationBusy(true)
      setAnticipationError('')
      try {
        const created = await api.createAnticipationSession(input)
        setAnticipationSession(created)
        showNotice(
          created.carriedOverCount
            ? `Sessão criada com ${created.carriedOverCount} associados da rodada anterior`
            : 'Sessão de antecipação criada',
        )
      } catch (error) {
        setAnticipationError(
          error instanceof Error
            ? error.message
            : 'Não foi possível criar a sessão.',
        )
        throw error
      } finally {
        setAnticipationBusy(false)
      }
    },
    onAddEntry: async (input: AnticipationEntryInput) => {
      if (!anticipationSession) return
      setAnticipationBusy(true)
      setAnticipationError('')
      try {
        setAnticipationSession(
          await api.addAnticipationEntry(anticipationSession.id, input),
        )
      } catch (error) {
        setAnticipationError(
          error instanceof Error
            ? error.message
            : 'Não foi possível incluir no ranking.',
        )
        throw error
      } finally {
        setAnticipationBusy(false)
      }
    },
    onRemoveEntry: async (entryId: string) => {
      if (!anticipationSession) return
      setAnticipationBusy(true)
      setAnticipationError('')
      try {
        await api.removeAnticipationEntry(anticipationSession.id, entryId)
        await refreshAnticipation()
      } catch (error) {
        setAnticipationError(
          error instanceof Error ? error.message : 'Não foi possível remover.',
        )
      } finally {
        setAnticipationBusy(false)
      }
    },
    onResetRanking: async () => {
      if (!anticipationSession) return
      setAnticipationBusy(true)
      setAnticipationError('')
      try {
        setAnticipationSession(
          await api.resetAnticipationRanking(anticipationSession.id),
        )
        showNotice('Ranking zerado: antecipações apagadas para o teste')
      } catch (error) {
        setAnticipationError(
          error instanceof Error
            ? error.message
            : 'Não foi possível zerar o ranking.',
        )
      } finally {
        setAnticipationBusy(false)
      }
    },
    onStatus: async (status: AnticipationSession['status']) => {
      if (!anticipationSession) return
      setAnticipationBusy(true)
      setAnticipationError('')
      try {
        const updated = await api.setAnticipationSessionStatus(
          anticipationSession.id,
          status,
        )
        setAnticipationSession(status === 'closed' ? null : updated)
        showNotice({
          draft: 'Antecipações reabertas para ajustes',
          locked: 'Antecipações travadas sem iniciar o sorteio',
          active: 'Sorteio iniciado: o antecipador faz a primeira escolha',
          closed: 'Sessão de antecipação encerrada',
        }[status])
      } catch (error) {
        setAnticipationError(
          error instanceof Error
            ? error.message
            : 'Não foi possível atualizar a sessão.',
        )
      } finally {
        setAnticipationBusy(false)
      }
    },
    onSaveSlots: async (anticipatorSlots: number) => {
      if (!anticipationSession) return
      setAnticipationBusy(true)
      setAnticipationError('')
      try {
        setAnticipationSession(
          await api.setAnticipatorSlots(anticipationSession.id, anticipatorSlots),
        )
        showNotice(`Vagas de antecipação: ${anticipatorSlots}`)
      } catch (error) {
        setAnticipationError(
          error instanceof Error
            ? error.message
            : 'Não foi possível salvar as vagas.',
        )
      } finally {
        setAnticipationBusy(false)
      }
    },
    onSaveConfirmationDeadline: async (confirmationDeadline: string | null) => {
      if (!anticipationSession) return
      setAnticipationBusy(true)
      setAnticipationError('')
      try {
        setAnticipationSession(
          await api.setConfirmationDeadline(
            anticipationSession.id,
            confirmationDeadline,
          ),
        )
        showNotice(
          confirmationDeadline
            ? `Prazo para confirmar: ${new Date(confirmationDeadline).toLocaleString('pt-BR')}`
            : 'Prazo de confirmação removido',
        )
      } catch (error) {
        setAnticipationError(
          error instanceof Error
            ? error.message
            : 'Não foi possível salvar o prazo.',
        )
      } finally {
        setAnticipationBusy(false)
      }
    },
    onSaveLiveUrl: async (liveUrl: string) => {
      if (!anticipationSession) return
      setAnticipationBusy(true)
      setAnticipationError('')
      try {
        setAnticipationSession(
          await api.setAnticipationLiveUrl(anticipationSession.id, liveUrl),
        )
        showNotice('Link da live atualizado')
      } catch (error) {
        setAnticipationError(
          error instanceof Error
            ? error.message
            : 'Não foi possível salvar o link da live.',
        )
      } finally {
        setAnticipationBusy(false)
      }
    },
  }

  return (
    <div
      className={`app-shell ${presenting ? 'is-presenting' : ''}${
        anticipationSession?.status === 'active' ? ' has-active-turn' : ''
      }`}
    >
      <header className="topbar">
        <div className="brand">
          <img
            className="brand-logo"
            src="/vida-nova-30-anos.png"
            alt="Cooperativa Habitacional Vida Nova — 30 anos"
          />
        </div>

        <nav className="app-nav" aria-label="Seções do sistema">
          <button
            type="button"
            className={
              screen === 'sorteio' || !canViewAnticipation ? 'active' : ''
            }
            onClick={() => goToScreen('sorteio')}
          >
            <Layers3 size={15} /> Mapa do sorteio
          </button>
          {canViewAnticipation && (
            <button
              type="button"
              className={screen === 'ranking' ? 'active' : ''}
              onClick={() => goToScreen('ranking')}
            >
              <Trophy size={15} /> Antecipação
            </button>
          )}
          {canViewAnticipation && (
            <button
              type="button"
              className={screen === 'cobranca' ? 'active' : ''}
              onClick={() => goToScreen('cobranca')}
            >
              <MessagesSquare size={15} /> Cobrança
            </button>
          )}
        </nav>

        <button
          type="button"
          className="active-event-switch"
          onClick={() => setConfirmEventSwitch(true)}
          title="Trocar condomínio, grupo ou bloco"
        >
          <span className="active-event-icon">
            <Building2 size={16} />
          </span>
          <span>
            <small>Evento atual</small>
            <strong>{activeProject.name}</strong>
          </span>
          <span className="active-event-scope">
            <b>Grupo {activeDrawGroup}</b>
            <b>Bloco {eventWorkspace.block}</b>
          </span>
          <ChevronDown size={15} />
        </button>

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
                {currentUser.role === 'admin'
                  ? 'Administrador'
                  : currentUser.role === 'operator_sede'
                    ? 'Operador Sede'
                    : 'Operador Obra'}
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
          {currentUser.role === 'admin' && (
            <button
              type="button"
              className="ghost-button"
              onClick={() => setIssueBoardOpen(true)}
              title="Roadmap e issues"
            >
              <Kanban size={16} /> <span>Roadmap</span>
            </button>
          )}
          <button
            type="button"
            className="ghost-button data-button"
            title="Modo apresentação (tela cheia)"
            onClick={() => void enterPresentation()}
          >
            <Maximize2 size={16} /> <span>Tela cheia</span>
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
              void logout().finally(() => {
                setCurrentUser(null)
                setEventWorkspace(null)
              })
            }}
            title="Sair"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <section className="event-title-strip">
        <span className="event-title-dot" aria-hidden="true" />
        <strong>{eventTitle}</strong>
        <small>
          {activeProject.name} · {activeProject.location}
        </small>
      </section>

      {anticipationSession?.status === 'active' && (
        <section
          className={`active-turn-strip is-${anticipationSession.nextSource}`}
          aria-live="polite"
        >
          <span className="active-turn-label">Vez atual</span>
          <strong>
            {anticipationSession.nextSource === 'anticipator'
              ? 'Antecipador'
              : 'Sorteio'}
          </strong>
          <small>
            {anticipationSession.awaitingNext
              ? 'Reserva feita. Próximo troca a plaquinha.'
              : anticipationSession.nextSource === 'anticipator' &&
                  anticipationSession.nextAnticipator
                ? `${anticipationSession.nextAnticipator.associateCode} · ${anticipationSession.nextAnticipator.participant}`
                : anticipationSession.nextSource === 'draw'
                  ? 'Informe a bolinha ao escolher a unidade'
                  : 'Ranking de antecipadores concluído'}
          </small>
          <span className="active-turn-rule">
            {anticipationSession.anticipatorTurnsUsed >=
            anticipationSession.anticipatorSlots
              ? `As ${anticipationSession.anticipatorSlots} chamadas de antecipador acabaram. A vez fica só no sorteio.`
              : `A plaquinha só muda no Próximo. Abdições contam nas ${anticipationSession.anticipatorSlots} chamadas.`}
          </span>
          <button
            type="button"
            className="turn-next-button"
            disabled={!anticipationSession.awaitingNext || turnBusy}
            onClick={() => void advanceTurn()}
          >
            Próximo
          </button>
        </section>
      )}

      {screen === 'cobranca' && canViewAnticipation ? (
        <CobrancaDesk building={building} group={activeDrawGroup ?? ''} />
      ) : screen === 'ranking' && canViewAnticipation ? (
        <RankingBoard
          building={building}
          drawGroup={activeDrawGroup}
          eventBlock={`Bloco ${eventWorkspace.block}`}
          session={anticipationSession}
          admin={currentUser.role === 'admin'}
          busy={anticipationBusy}
          error={anticipationError}
          onOpenMap={() => goToScreen('sorteio')}
          {...anticipationActions}
          onSaveSlots={anticipationActions.onSaveSlots}
        />
      ) : (
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
              {activeDrawGroup && (
                <label className="draw-group-selector">
                  <span>Grupo do sorteio</span>
                  <select
                    value={activeDrawGroup}
                    onChange={(event) => {
                      const group = event.target.value as DrawGroup
                      setActiveDrawGroups((current) => ({
                        ...current,
                        [building]: group,
                      }))
                      setEventWorkspace((current) =>
                        current ? { ...current, group } : current,
                      )
                      setDrawBall('')
                    }}
                  >
                    {drawGroups.map((group) => (
                      <option value={group} key={group}>
                        G{group}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className="viewer-assists">
                <button
                  type="button"
                  className={`environment-toggle ${showFloorScale ? 'active' : ''}`}
                  onClick={() => setShowFloorScale((visible) => !visible)}
                  aria-pressed={showFloorScale}
                  title="Mostrar a numeração dos andares na lateral da torre"
                >
                  <Ruler size={14} /> Andares
                </button>
                <button
                  type="button"
                  className={`environment-toggle ${showAvailability ? 'active' : ''}`}
                  onClick={() => setShowAvailability((visible) => !visible)}
                  aria-pressed={showAvailability}
                  title="Verde disponível, laranja selecionado e vermelho reservado"
                >
                  <Palette size={14} /> Disponibilidade
                </button>
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
                {presenting && (
                  <button
                    type="button"
                    className="presentation-exit"
                    onClick={() => void exitPresentation()}
                    title="Sair do modo apresentação"
                  >
                    <Minimize2 size={14} /> Sair da tela cheia
                    <kbd>Esc</kbd>
                  </button>
                )}
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
                  showFloorScale={showFloorScale}
                  highlightAvailability={showAvailability}
                  onSelect={selectApartment}
                  onActivate={requestApartment}
                />
                {!showFloorPlan && (
                  <TurnSign
                    session={anticipationSession}
                    variant="canvas"
                    nextBusy={turnBusy}
                    onNext={() => void advanceTurn()}
                  />
                )}
                {showEnvironment && !showFloorPlan ? (
                  <EnvironmentOverlay
                    showLabels={
                      config.hasEnvironmentLabels ||
                      buildingEdgeLandmarks.length > 0
                    }
                    landmarks={buildingEdgeLandmarks}
                    activeLandmarks={
                      selectedApartment ? selectedEdgeLandmarks : undefined
                    }
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
                {showAvailability && (
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
                          {
                            '--legend-color': SELECTED_UNIT_COLOR,
                          } as CSSProperties
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
                  <TurnSign
                    session={anticipationSession}
                    variant="canvas"
                    nextBusy={turnBusy}
                    onNext={() => void advanceTurn()}
                  />
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
                          setView(viewForEnding(config, ending))
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
                          setView(viewForEnding(config, selectedApartment.ending))
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
                    highlightAvailability={showAvailability}
                    onSelect={selectApartment}
                    onActivate={requestApartment}
                  />
                  {showEnvironment && (
                    <EnvironmentOverlay
                      variant="plan"
                      showLabels={
                        config.hasEnvironmentLabels ||
                        buildingEdgeLandmarks.length > 0
                      }
                      landmarks={buildingEdgeLandmarks}
                      activeLandmarks={
                        selectedApartment ? selectedEdgeLandmarks : undefined
                      }
                    />
                  )}
                  {solarCards}
                </div>
              )}
              {!showFloorPlan && solarCards}
            </div>
          </section>

          <aside className="control-panel">
            <section className="panel-section draw-overview-section">
              <div className="section-heading draw-overview-heading">
                <div>
                  <span className="eyebrow">Painel do sorteio</span>
                  <h2>Visão geral do empreendimento</h2>
                </div>
                <ShieldCheck size={21} className="reservation-shield" />
              </div>
              <TurnSign
                session={anticipationSession}
                variant="panel"
                nextBusy={turnBusy}
                onNext={() => void advanceTurn()}
              />
              <div className="draw-metrics-grid">
                <article>
                  <strong>{config.apartments.length}</strong>
                  <span>Total</span>
                </article>
                <article className="is-chosen">
                  <strong>{filledCount}</strong>
                  <span>Escolhidos</span>
                </article>
                <article className="is-free">
                  <strong>{counts.none}</strong>
                  <span>Livres</span>
                </article>
                <article className="is-abdication">
                  <strong>{buildingDeclines.length}</strong>
                  <span>Abdicações</span>
                </article>
                <article>
                  <strong>{anticipatorDeclines}</strong>
                  <span>Antecipador</span>
                </article>
                <article>
                  <strong>{drawDeclines}</strong>
                  <span>Sorteio</span>
                </article>
              </div>
              <div className="draw-progress">
                <span>
                  <b>{progress}% concluído</b>
                  <small>
                    {counts.none} unidades disponíveis para escolha
                  </small>
                </span>
                <div>
                  <i style={{ width: `${progress}%` }} />
                </div>
              </div>
            </section>

            {canViewAnticipation && (
              <AnticipationPanel
                building={building}
                drawGroup={activeDrawGroup}
                session={anticipationSession}
                admin={currentUser.role === 'admin'}
                busy={anticipationBusy}
                error={anticipationError}
                onOpenBoard={() => goToScreen('ranking')}
                {...anticipationActions}
              />
            )}

            <DeclinedDrawsPanel
              building={building}
              activeGroup={activeDrawGroup}
              anticipationSession={anticipationSession}
              items={buildingDeclines}
              busy={declineBusy}
              error={declineError}
              onAdd={async (input) => {
                setDeclineError('')
                if (!input.ball) {
                  setDeclineError(
                    activeDrawGroup
                      ? 'Informe uma bolinha entre 1 e 9999.'
                      : 'Informe o código do associado.',
                  )
                  return false
                }
                setDeclineBusy(true)
                try {
                  const created = await api.addDecline({
                    building,
                    ...input,
                  })
                  setDeclines((current) => [created, ...current])
                  showNotice(
                    `Associado ${created.ball} incluído na Lista de Abdicação`,
                  )
                  await refreshAnticipation()
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
                      Código associado{' '}
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
              assignments={assignments}
              selectedId={selectedId}
              floorFilter={floorFilter}
              endingFilter={endingFilter}
              statusFilter={statusFilter}
              onSelect={selectApartment}
              onActivate={requestApartment}
            />

          </aside>
        </main>
      )}

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

            {!pendingExisting && anticipationSession?.status === 'active' && (
              <div
                className={`modal-choice-source is-${anticipationSession.nextSource}`}
              >
                {anticipationSession.nextSource === 'anticipator'
                  ? 'Escolha do antecipador'
                  : 'Escolha por sorteio'}
              </div>
            )}

            <label className="modal-field">
              <span>
                {!pendingExisting &&
                anticipationSession?.status === 'active' &&
                anticipationSession.nextSource === 'anticipator'
                  ? 'Contrato do antecipador *'
                  : activeDrawGroup
                    ? 'Bolinha sorteada *'
                    : 'Código associado *'}
              </span>
              <div className={activeDrawGroup ? 'associate-code-input' : undefined}>
                {activeDrawGroup && <b>{activeDrawGroup}</b>}
                <input
                  autoFocus
                  value={drawBall}
                  inputMode={activeDrawGroup ? 'numeric' : undefined}
                  maxLength={activeDrawGroup ? 4 : undefined}
                  readOnly={
                    !pendingExisting &&
                    anticipationSession?.status === 'active' &&
                    anticipationSession.nextSource === 'anticipator'
                  }
                  onChange={(event) => {
                    setDrawBall(
                      activeDrawGroup
                        ? event.target.value.replace(/\D/g, '').slice(0, 4)
                        : event.target.value,
                    )
                    setModalError('')
                  }}
                  placeholder={activeDrawGroup ? '0001' : 'Ex.: 110396'}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') confirmApartment()
                  }}
                />
              </div>
              {activeDrawGroup && (
                <small className="associate-code-preview">
                  Código associado:{' '}
                  <b>
                    {buildAssociateCode(activeDrawGroup, drawBall) ??
                      `${activeDrawGroup}----`}
                  </b>
                </small>
              )}
            </label>

            <label className="modal-field">
              <span>
                {!pendingExisting &&
                anticipationSession?.status === 'active' &&
                anticipationSession.nextSource === 'anticipator'
                  ? 'Nome do antecipador'
                  : 'Nome do sorteado'}
              </span>
              <input
                value={participant}
                readOnly={
                  !pendingExisting &&
                  anticipationSession?.status === 'active' &&
                  anticipationSession.nextSource === 'anticipator'
                }
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
          edgeLandmarks={edgeLandmarks}
          onUpdate={async (kind, ending, items) => {
            setSurroundings(kind, ending, items)
            await api.updateSurroundings(kind, ending, items)
            await refreshMap()
          }}
          onSaveSolar={async (kind, ending, illustrations) => {
            await api.updateSolarIllustrations(kind, ending, illustrations)
            setSolarIllustrations(kind, ending, illustrations)
            await refreshMap()
          }}
          onSaveEdge={async (kind, ending, landmarks) => {
            await api.updateEdgeLandmarks(kind, ending, landmarks)
            setEdgeLandmarks(kind, ending, landmarks)
            await refreshMap()
          }}
          mapBuilding={building}
          activeGroup={activeDrawGroup}
          assignments={assignments}
          declines={declines}
          onArchived={async (kind, group) => {
            await refreshMap()
            const next =
              group && (kind === 'odd' || kind === 'even')
                ? nextDrawGroup(kind, group)
                : undefined
            if (next && (kind === 'odd' || kind === 'even')) {
              setActiveDrawGroups((current) => ({
                ...current,
                [kind]: next,
              }))
            }
            showNotice(
              group
                ? next
                  ? `Grupo G${group} arquivado. Mapa limpo. Próximo grupo: G${next}.`
                  : `Grupo G${group} arquivado. Mapa limpo para o próximo empreendimento.`
                : 'Sorteio arquivado. Mapa limpo para o próximo empreendimento.',
            )
          }}
          onClose={() => setAdminOpen(false)}
        />
      )}

      {confirmEventSwitch && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setConfirmEventSwitch(false)
            }
          }}
        >
          <section
            className="event-switch-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="event-switch-title"
          >
            <span className="event-switch-icon">
              <Building2 size={20} />
            </span>
            <h2 id="event-switch-title">Alterar o evento em andamento?</h2>
            <p>
              O evento atual é <b>{eventTitle}</b>. Ao trocar, você volta para a
              seleção de condomínio, grupo e bloco. As reservas já registradas
              não são apagadas.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setConfirmEventSwitch(false)}
              >
                Continuar no evento
              </button>
              <button
                type="button"
                className="confirm-button"
                onClick={() => {
                  setConfirmEventSwitch(false)
                  setEventWorkspace(null)
                }}
              >
                Alterar evento
              </button>
            </div>
          </section>
        </div>
      )}

      {notice && <div className="toast">{notice}</div>}
      {!presenting && <SiteFooter floating />}
      <IssueDesk
        admin={currentUser.role === 'admin'}
        place={`${eventTitle} · Grupo ${activeDrawGroup ?? '—'} · Bloco ${eventWorkspace.block}`}
        hidden={presenting}
        boardOpen={issueBoardOpen}
        onBoardOpen={setIssueBoardOpen}
      />
    </div>
  )
}

export default App

