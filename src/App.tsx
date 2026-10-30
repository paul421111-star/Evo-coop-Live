import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import {
  ArrowUpToLine,
  Building2,
  CalendarClock,
  Check,
  ChevronDown,
  Compass,
  Eraser,
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
import { LoggedAssociates } from './components/LoggedAssociates'
import { SiteFooter } from './components/SiteFooter'
import { SurroundingIcon } from './components/SurroundingIcon'
import { ContractDigits } from './components/contractDigits'
import { DrawnBallField, TurnSign } from './components/TurnSign'
import {
  BUILDING_CONFIGS,
  SELECTED_UNIT_COLOR,
  STATUS_BY_ID,
  STATUS_OPTIONS,
  apartmentId,
  apartmentStorageId,
  buildingEndingsForFloor,
  buildingFloors,
  highestFreeApartment,
  viewForEnding,
  type ApartmentStatus,
  type BuildingKind,
  type Ending,
} from './config/building'
import type { DrawDecline, DrawDeclineReason } from './config/drawDeclines'
import {
  turnCallLabel,
  type AnticipationEntryInput,
  type AnticipationSession,
  type AnticipationSessionInput,
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
  type SolarIllustration,
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
  const canViewAnticipation =
    currentUser?.role === 'admin' || currentUser?.role === 'operator_sede'
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
  const [followHighestFree, setFollowHighestFree] = useState(false)
  const [notice, setNotice] = useState('')
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [pendingExisting, setPendingExisting] = useState(false)
  const [drawBall, setDrawBall] = useState('')
  /** Código já mandado para a live. A digitação fica só neste computador. */
  const [liveSentCode, setLiveSentCode] = useState('')
  const [liveDrawEpoch, setLiveDrawEpoch] = useState(0)
  const [participant, setParticipant] = useState('')
  const [justification, setJustification] = useState('')
  const [modalError, setModalError] = useState('')
  const [showEnvironment, setShowEnvironment] = useState(true)
  const [showFloorScale, setShowFloorScale] = useState(true)
  const [showAvailability, setShowAvailability] = useState(true)
  const [sceneTheme, setSceneTheme] = useState<'dark' | 'light'>(() =>
    window.localStorage.getItem('evo-coop-scene-theme') === 'light'
      ? 'light'
      : 'dark',
  )
  const [canvasLayout, setCanvasLayout] = useState<'both' | 'tower' | 'plan'>(
    () => {
      const saved = window.localStorage.getItem('evo-coop-canvas-layout')
      return saved === 'tower' || saved === 'plan' ? saved : 'both'
    },
  )
  const [declines, setDeclines] = useState<DrawDecline[]>([])
  const [declineError, setDeclineError] = useState('')
  const [declineBusy, setDeclineBusy] = useState(false)
  const [presenting, setPresenting] = useState(false)
  const [issueBoardOpen, setIssueBoardOpen] = useState(false)
  const [anticipationSession, setAnticipationSession] =
    useState<AnticipationSession | null>(null)
  const [anticipationBusy, setAnticipationBusy] = useState(false)
  const [periodOpen, setPeriodOpen] = useState(false)
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [turnBusy, setTurnBusy] = useState(false)
  const [anticipationError, setAnticipationError] = useState('')
  const [clearMapOpen, setClearMapOpen] = useState(false)
  const [clearMapBusy, setClearMapBusy] = useState(false)

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
  const highestFree = useMemo(
    () => highestFreeApartment(config, statuses),
    [config, statuses],
  )

  const selectedApartment = config.apartmentById[selectedId]
  const drawGroups = drawGroupsForBuilding(building)
  const activeDrawGroup = activeDrawGroups[building]
  const drawReservations = Object.entries(assignments).filter(
    ([storageId, item]) => {
      if (!storageId.startsWith(`${building}:`)) return false
      if (item.choiceSource === 'anticipator') return false
      if (activeDrawGroup && !item.ball.startsWith(activeDrawGroup)) return false
      return true
    },
  ).length
  const drawnAssociateCode =
    anticipationSession?.status === 'active' &&
    anticipationSession.nextSource === 'draw'
      ? activeDrawGroup
        ? buildAssociateCode(activeDrawGroup, drawBall)
        : drawBall.trim() || null
      : null
  const liveAssociateCode =
    anticipationSession?.status === 'active' &&
    anticipationSession.nextSource === 'anticipator'
      ? (anticipationSession.nextAnticipator?.associateCode ?? '')
      : liveSentCode
  const publishDrawCode =
    anticipationSession?.status === 'active' &&
    (anticipationSession.nextSource === 'anticipator' || liveDrawEpoch > 0)
  const drawnName =
    anticipationSession?.entries.find(
      (entry) => entry.associateCode === drawnAssociateCode,
    )        ?.participant ?? ''
  const lockedCurrentChoice =
    !pendingExisting &&
    anticipationSession?.status === 'active' &&
    (anticipationSession.nextSource === 'anticipator' ||
      anticipationSession.nextSource === 'draw')
  const setDrawnBall = (value: string) => {
    const ball = activeDrawGroup
      ? value.replace(/\D/g, '').slice(0, 4)
      : value
    setDrawBall(ball)
    const code = activeDrawGroup
      ? buildAssociateCode(activeDrawGroup, ball)
      : ball.trim()
    setParticipant(
      anticipationSession?.entries.find((entry) => entry.associateCode === code)
        ?.participant ?? '',
    )
  }
  const refreshAnticipation = async () => {
    const session = await api.currentAnticipationSession(
      building,
      activeDrawGroup,
    )
    setAnticipationSession(session)
  }

  useEffect(() => {
    if (currentUser?.role !== 'live') return
    let active = true
    const follow = () => {
      void api
        .liveBoard()
        .then((board) => {
          if (!active || !board || !(board.building in BUILDING_CONFIGS)) return
          const kind = board.building
          const groups = drawGroupsForBuilding(kind)
          if (!groups.includes(board.drawGroup as DrawGroup)) return
          const group = board.drawGroup as DrawGroup
          const project = projectForBuilding(kind)
          const block =
            PROJECTS.find((item) => item.id === project)?.defaultBlock ?? 'D'
          setBuilding(kind)
          setActiveDrawGroups((current) =>
            current[kind] === group ? current : { ...current, [kind]: group },
          )
          setEventWorkspace((current) =>
            current?.building === kind && current.group === group
              ? current
              : { project, building: kind, group, block },
          )
          if (BUILDING_CONFIGS[kind].apartmentById[board.focusApartment]) {
            setSelectedId(board.focusApartment)
          }
          if (
            board.view === 'perspective' ||
            board.view === 'front' ||
            board.view === 'back' ||
            board.view === 'east' ||
            board.view === 'west'
          ) {
            setView(board.view)
          }
          setSceneTheme(board.sceneTheme === 'light' ? 'light' : 'dark')
          setShowAvailability(board.highlightAvailability !== false)
          if (
            board.canvasLayout === 'both' ||
            board.canvasLayout === 'tower' ||
            board.canvasLayout === 'plan'
          ) {
            setCanvasLayout(board.canvasLayout)
          }
          if (/^\d{6}$/.test(board.associateCode)) {
            setDrawBall(board.associateCode.slice(-4))
          }
          void api
            .currentAnticipationSession(kind, group)
            .then((session) => {
              if (active) setAnticipationSession(session)
            })
            .catch(() => undefined)
        })
        .catch(() => undefined)
      void refreshMap().catch(() => undefined)
    }
    follow()
    const timer = window.setInterval(follow, 1000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
    // A transmissão só espelha o operador. O mapa e a plaquinha vêm daqui.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser])

  useEffect(() => {
    if (
      !currentUser ||
      !eventWorkspace ||
      (!canViewAnticipation && currentUser.role !== 'live')
    )
      return
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
      currentUser.role === 'live' ||
      screen !== 'sorteio' ||
      !eventWorkspace
    )
      return
    const timer = window.setTimeout(() => {
      void api
        .publishLiveBoard({
          building,
          drawGroup: activeDrawGroup,
          associateCode: liveAssociateCode,
          publishAssociate: publishDrawCode,
          focusApartment: config.apartmentById[selectedId] ? selectedId : '',
          view,
          sceneTheme,
          highlightAvailability: showAvailability,
          canvasLayout,
        })
        .catch(() => undefined)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [
    currentUser,
    screen,
    eventWorkspace,
    building,
    activeDrawGroup,
    liveAssociateCode,
    publishDrawCode,
    selectedId,
    view,
    sceneTheme,
    showAvailability,
    canvasLayout,
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
  const floorPlanReady = Boolean(config.floorModel && selectedApartment)
  const showTower = !floorPlanReady || canvasLayout !== 'plan'
  const showFloorPlan = floorPlanReady && canvasLayout !== 'tower'
  const solarFigure = (illustration: SolarIllustration) => {
    if (!selectedApartment) return null
    const option = SOLAR_ILLUSTRATION_BY_ID[illustration]
    return (
      <figure
        className={`solar-illustration-card canvas-solar-card is-${illustration}`}
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
  }
  const sunriseIllustrations = selectedSolarIllustrations.filter(
    (illustration) => illustration === 'sunrise',
  )
  const stackedSolar = selectedSolarIllustrations.filter(
    (illustration) => !showFloorPlan || illustration !== 'sunrise',
  )
  const solarCards =
    selectedApartment && stackedSolar.length > 0 ? (
      <div className="canvas-solar-stack">
        {stackedSolar.map(solarFigure)}
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

  const sendDrawToLive = () => {
    if (!drawnAssociateCode || drawnAssociateCode === liveSentCode) return
    setLiveSentCode(drawnAssociateCode)
    setLiveDrawEpoch((current) => current + 1)
    showNotice('Número enviado para a live.')
  }

  const clearLiveDrawCode = () => {
    setLiveSentCode('')
    setLiveDrawEpoch((current) => current + 1)
  }

  const registerDecline = async (input: {
    ball: string
    participant: string
    source: 'draw' | 'anticipator'
    reason: DrawDeclineReason
    notes: string
    anticipationSessionId?: string
    anticipationEntryId?: string
  }) => {
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
      showNotice(`Associado ${created.ball} incluído na Lista de Abdicação`)
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
  }

  const abdicateCurrent = async (
    reason: Extract<DrawDeclineReason, 'refused' | 'no-answer'>,
  ) => {
    if (anticipationSession?.status !== 'active' || anticipationSession.awaitingNext) {
      return
    }
    const source = anticipationSession.nextSource
    const anticipator = anticipationSession.nextAnticipator
    const ball =
      source === 'anticipator'
        ? (anticipator?.associateCode ?? '')
        : (drawnAssociateCode ?? '')
    const saved = await registerDecline({
      ball,
      participant:
        source === 'anticipator'
          ? (anticipator?.participant ?? '')
          : drawnName,
      source,
      reason,
      notes: '',
      anticipationSessionId: anticipationSession.id,
      anticipationEntryId:
        source === 'anticipator' ? anticipator?.id : undefined,
    })
    if (saved && source === 'draw') {
      setDrawnBall('')
      clearLiveDrawCode()
    }
  }

  const clearTestMap = async () => {
    setClearMapBusy(true)
    try {
      const result = await api.clearBuildingMap(building)
      await refreshMap()
      await refreshAnticipation()
      setPendingId(null)
      setClearMapOpen(false)
      showNotice(
        `Mapa e ranking limpos: ${result.clearedReservations} reserva${result.clearedReservations === 1 ? '' : 's'} e ${result.clearedRanking} situação${result.clearedRanking === 1 ? '' : 'ões'} do sorteio removidas.`,
      )
    } catch (error) {
      showNotice(
        error instanceof Error
          ? error.message
          : 'Não foi possível limpar o mapa.',
      )
    } finally {
      setClearMapBusy(false)
    }
  }

  const selectApartment = (id: string) => {
    if (!highestFree || id !== highestFree.id) setFollowHighestFree(false)
    setSelectedId(id)
    const apartment = config.apartmentById[id]
    if (apartment) setView(viewForEnding(config, apartment.ending))
    if (config.groundFloorModel && apartment) {
      setFloorPlanKind(apartment.floor === 0 ? 'ground' : 'typical')
    }
  }

  const transmission = currentUser?.role === 'live'

  if (followHighestFree && !transmission && highestFree) {
    const nextView = viewForEnding(config, highestFree.ending)
    const nextPlan = highestFree.floor === 0 ? 'ground' : 'typical'
    if (
      selectedId !== highestFree.id ||
      floorFilter !== highestFree.floor ||
      view !== nextView ||
      (Boolean(config.groundFloorModel) && floorPlanKind !== nextPlan)
    ) {
      setFloorFilter(highestFree.floor)
      setSelectedId(highestFree.id)
      setView(nextView)
      if (config.groundFloorModel) setFloorPlanKind(nextPlan)
    }
  }

  const requestApartment = (id: string) => {
    if (transmission) return
    if (!highestFree || id !== highestFree.id) setFollowHighestFree(false)
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
    const drawnTurn =
      !existing &&
      anticipationSession?.status === 'active' &&
      anticipationSession.nextSource === 'draw'
    if (drawnTurn && !drawnAssociateCode) {
      showNotice(
        'Informe o número do sorteado na plaquinha antes de escolher o apartamento.',
      )
      return
    }
    setDrawBall(
      nextAnticipator
        ? activeDrawGroup
          ? nextAnticipator.associateCode.slice(-4)
          : nextAnticipator.associateCode
        : drawnTurn
          ? drawBall
          : (parsed?.ball ?? existing?.ball ?? ''),
    )
    setParticipant(
      nextAnticipator?.participant ??
        (drawnTurn ? drawnName : (existing?.participant ?? '')),
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
      setDrawBall('')
      setParticipant('')
      clearLiveDrawCode()
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

  if (currentUser.role === 'live' && !eventWorkspace) {
    return <div className="auth-loading">Abrindo a transmissão…</div>
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
    onAbdicateEntry: async (entryId: string, reason: string) => {
      if (!anticipationSession) return
      setAnticipationBusy(true)
      setAnticipationError('')
      try {
        setAnticipationSession(
          await api.abdicateAnticipationEntry(
            anticipationSession.id,
            entryId,
            reason,
          ),
        )
        await refreshMap()
        showNotice('Abdicação registrada fora da vez. A fila já andou.')
      } catch (error) {
        setAnticipationError(
          error instanceof Error
            ? error.message
            : 'Não foi possível registrar a abdicação.',
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
    onSavePeriod: async (startsAt: string, endsAt: string) => {
      if (!anticipationSession) return
      setAnticipationBusy(true)
      setAnticipationError('')
      try {
        setAnticipationSession(
          await api.setAnticipationPeriod(
            anticipationSession.id,
            startsAt,
            endsAt,
          ),
        )
        setPeriodOpen(false)
        showNotice('Período do evento atualizado')
      } catch (error) {
        setAnticipationError(
          error instanceof Error
            ? error.message
            : 'Não foi possível salvar o período.',
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
    onDelinquentPolicy: async (policy: {
      delinquentCanAccess?: boolean
      delinquentCanParticipate?: boolean
    }) => {
      if (!anticipationSession) return
      setAnticipationBusy(true)
      setAnticipationError('')
      try {
        setAnticipationSession(
          await api.setDelinquentPolicy(anticipationSession.id, policy),
        )
      } catch (error) {
        setAnticipationError(
          error instanceof Error
            ? error.message
            : 'Não foi possível salvar a regra de inadimplência.',
        )
      } finally {
        setAnticipationBusy(false)
      }
    },
    onMarkDelinquent: async (entryId: string, delinquent: boolean) => {
      if (!anticipationSession) return
      setAnticipationBusy(true)
      setAnticipationError('')
      try {
        setAnticipationSession(
          await api.setEntryDelinquent(
            anticipationSession.id,
            entryId,
            delinquent,
          ),
        )
      } catch (error) {
        setAnticipationError(
          error instanceof Error
            ? error.message
            : 'Não foi possível marcar o contrato.',
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
          onClick={transmission ? undefined : () => setConfirmEventSwitch(true)}
          disabled={transmission}
          title={transmission ? 'Evento acompanhado ao vivo' : 'Trocar condomínio, grupo ou bloco'}
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
          {!transmission && <ChevronDown size={15} />}
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
          {currentUser.role !== 'live' && activeDrawGroup && (
            <LoggedAssociates
              building={building}
              drawGroup={activeDrawGroup}
            />
          )}
          <div className="current-user" title={`Conectado como ${currentUser.username}`}>
            <span>{currentUser.username.slice(0, 1).toUpperCase()}</span>
            <div>
              <b>{currentUser.username}</b>
              <small>
                {currentUser.role === 'admin'
                  ? 'Administrador'
                  : currentUser.role === 'operator_sede'
                    ? 'Operador Sede'
                    : currentUser.role === 'live'
                      ? 'Transmissão'
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
        {screen === 'sorteio' &&
          currentUser.role === 'admin' &&
          anticipationSession && (
            <EventPeriodEditor
              startsAt={anticipationSession.startsAt}
              endsAt={anticipationSession.endsAt}
              open={periodOpen}
              startValue={periodStart}
              endValue={periodEnd}
              busy={anticipationBusy}
              error={anticipationError}
              onOpen={() => {
                setPeriodStart(datetimeLocalValue(anticipationSession.startsAt))
                setPeriodEnd(datetimeLocalValue(anticipationSession.endsAt))
                setPeriodOpen(true)
                setAnticipationError('')
              }}
              onClose={() => setPeriodOpen(false)}
              onStart={setPeriodStart}
              onEnd={setPeriodEnd}
              onSave={() => {
                const start = new Date(periodStart)
                const end = new Date(periodEnd)
                if (
                  Number.isNaN(start.getTime()) ||
                  Number.isNaN(end.getTime()) ||
                  end.getTime() <= start.getTime()
                ) {
                  setAnticipationError('O término precisa ser depois do início.')
                  return
                }
                void anticipationActions.onSavePeriod(
                  start.toISOString(),
                  end.toISOString(),
                )
              }}
            />
          )}
      </section>

      {anticipationSession?.status === 'active' && (
        <section
          className={`active-turn-strip is-${anticipationSession.nextSource}`}
          aria-live="polite"
        >
          <span className="active-turn-label">Vez atual</span>
          <strong>
            {turnCallLabel({
              source: anticipationSession.nextSource,
              anticipatorTurnsUsed: anticipationSession.anticipatorTurnsUsed,
              drawReservations,
              awaitingNext: anticipationSession.awaitingNext,
            })}
          </strong>
          {anticipationSession.nextSource === 'draw' &&
          !anticipationSession.awaitingNext ? (
            <DrawnBallField
              group={activeDrawGroup}
              ball={drawBall}
              code={drawnAssociateCode}
              name={drawnName}
              onChange={setDrawnBall}
              onSend={transmission ? undefined : sendDrawToLive}
              sent={
                Boolean(drawnAssociateCode) &&
                drawnAssociateCode === liveSentCode
              }
            />
          ) : (
            <span className="turn-current-value">
              {anticipationSession.nextSource === 'anticipator' &&
                anticipationSession.nextAnticipator && (
                  <span className="turn-sign-number">
                    <ContractDigits
                      code={anticipationSession.nextAnticipator.associateCode}
                    />
                  </span>
                )}
              {anticipationSession.awaitingNext && drawnAssociateCode && (
                <span className="turn-sign-number">
                  <ContractDigits code={drawnAssociateCode} />
                </span>
              )}
              <small>
                {anticipationSession.awaitingNext
                  ? 'Reservado. Próximo troca a plaquinha.'
                  : anticipationSession.nextSource === 'anticipator' &&
                      anticipationSession.nextAnticipator
                    ? anticipationSession.nextAnticipator.participant
                    : 'Ranking de antecipadores concluído'}
              </small>
            </span>
          )}
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
          <section
            className={`viewer-card ${sceneTheme === 'light' ? 'is-scene-light' : ''}`}
            aria-label="Visualização 3D do edifício"
          >
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
                    disabled={transmission}
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
                      clearLiveDrawCode()
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
                {config.floorModel && (
                  <div
                    className="scene-theme-switch canvas-layout-switch"
                    role="group"
                    aria-label="O que mostrar no mapa"
                  >
                    {(
                      [
                        ['both', 'Os dois', 'Prédio e planta juntos'],
                        ['tower', 'Prédio', 'Somente o prédio'],
                        ['plan', 'Planta', 'Somente a planta'],
                      ] as const
                    ).map(([id, label, title]) => (
                      <button
                        key={id}
                        type="button"
                        className={canvasLayout === id ? 'active' : ''}
                        aria-pressed={canvasLayout === id}
                        disabled={transmission}
                        title={title}
                        onClick={() => {
                          setCanvasLayout(id)
                          window.localStorage.setItem(
                            'evo-coop-canvas-layout',
                            id,
                          )
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
                <div className="scene-theme-switch" role="group" aria-label="Tema do fundo">
                  <button
                    type="button"
                    className={sceneTheme === 'light' ? 'active' : ''}
                    aria-pressed={sceneTheme === 'light'}
                    onClick={() => {
                      setSceneTheme('light')
                      window.localStorage.setItem('evo-coop-scene-theme', 'light')
                    }}
                  >
                    Claro
                  </button>
                  <button
                    type="button"
                    className={sceneTheme === 'dark' ? 'active' : ''}
                    aria-pressed={sceneTheme === 'dark'}
                    onClick={() => {
                      setSceneTheme('dark')
                      window.localStorage.setItem('evo-coop-scene-theme', 'dark')
                    }}
                  >
                    Escuro
                  </button>
                </div>
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

            <div
              className={`canvas-wrap${
                showTower && showFloorPlan ? ' split-canvas' : ''
              }${showFloorPlan && !showTower ? ' plan-only' : ''}`}
            >
              {showTower && (
              <div className="tower-view">
                <BuildingScene
                  config={config}
                  statuses={statuses}
                  selectedId={selectedId}
                  activeStatus="reserved"
                  view={view}
                  showFloorScale={showFloorScale}
                  highlightAvailability={showAvailability}
                  sceneTheme={sceneTheme}
                  pinSelectedLabel={false}
                  onSelect={transmission ? () => undefined : selectApartment}
                  onActivate={transmission ? () => undefined : requestApartment}
                />
                {!showFloorPlan && (
                  <TurnSign
                    session={anticipationSession}
                    variant="canvas"
                    nextBusy={turnBusy}
                    drawnGroup={activeDrawGroup}
                    drawnBall={drawBall}
                    drawnCode={drawnAssociateCode}
                    drawnName={drawnName}
                    onDrawnBallChange={transmission ? undefined : setDrawnBall}
                    onSendDraw={transmission ? undefined : sendDrawToLive}
                    drawSent={
                      Boolean(drawnAssociateCode) &&
                      drawnAssociateCode === liveSentCode
                    }
                    onNext={transmission ? undefined : () => void advanceTurn()}
                    drawReservations={drawReservations}
                    onAbdicate={transmission ? undefined : abdicateCurrent}
                    abdicateBusy={declineBusy}
                    abdicateError={declineError}
                  />
                )}
                {selectedApartment && (
                  <div className="tower-apt-label">
                    <strong>Apto {selectedApartment.id}</strong>
                    <span>{STATUS_BY_ID[selectedStatus].label}</span>
                  </div>
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
              )}
              {showFloorPlan && selectedApartment && (
                <div className="floor-plan-view">
                  <div className="floor-plan-toolbar">
                    <TurnSign
                      session={anticipationSession}
                      variant="canvas"
                      nextBusy={turnBusy}
                      drawnGroup={activeDrawGroup}
                      drawnBall={drawBall}
                      drawnCode={drawnAssociateCode}
                      drawnName={drawnName}
                      onDrawnBallChange={transmission ? undefined : setDrawnBall}
                      onSendDraw={transmission ? undefined : sendDrawToLive}
                      drawSent={
                        Boolean(drawnAssociateCode) &&
                        drawnAssociateCode === liveSentCode
                      }
                      onNext={transmission ? undefined : () => void advanceTurn()}
                      drawReservations={drawReservations}
                      onAbdicate={transmission ? undefined : abdicateCurrent}
                      abdicateBusy={declineBusy}
                      abdicateError={declineError}
                    />
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
                  </div>
                  {sunriseIllustrations.length > 0 && (
                    <div className="floor-plan-sunrise">
                      {sunriseIllustrations.map(solarFigure)}
                    </div>
                  )}
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
                  <div className="floor-plan-stage">
                  <FloorPlanScene
                    config={config}
                    floor={floorPlanFloor}
                    selectedId={selectedId}
                    statuses={statuses}
                    modelUrl={floorPlanModel}
                    endings={floorPlanEndings}
                    highlightAvailability={showAvailability}
                    sceneTheme={sceneTheme}
                    framed
                    onSelect={transmission ? () => undefined : selectApartment}
                    onActivate={transmission ? () => undefined : requestApartment}
                  />
                  </div>
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
                drawnGroup={activeDrawGroup}
                drawnBall={drawBall}
                drawnCode={drawnAssociateCode}
                drawnName={drawnName}
                onDrawnBallChange={transmission ? undefined : setDrawnBall}
                onSendDraw={transmission ? undefined : sendDrawToLive}
                drawSent={
                  Boolean(drawnAssociateCode) &&
                  drawnAssociateCode === liveSentCode
                }
                onNext={transmission ? undefined : () => void advanceTurn()}
                drawReservations={drawReservations}
                onAbdicate={transmission ? undefined : abdicateCurrent}
                abdicateBusy={declineBusy}
                abdicateError={declineError}
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
              readOnly={transmission}
              onAdd={registerDecline}
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
                {selectedApartment &&
                  config.extraSpaceByEnding?.[selectedApartment.ending] && (
                    <span className="selection-extra-space">
                      + {config.extraSpaceByEnding[selectedApartment.ending]}
                    </span>
                  )}
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
              {!transmission && (
              <button
                type="button"
                className="register-draw-button"
                onClick={() => requestApartment(selectedId)}
              >
                <Ticket size={16} />
                {selectedStatus === 'none'
                  ? 'Registrar sorteio desta unidade'
                  : currentUser.role === 'admin'
                    ? 'Editar reserva confirmada'
                    : 'Alterar reserva desta unidade'}
              </button>
              )}
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
                      setFollowHighestFree(false)
                      setFloorFilter('all')
                      setEndingFilter('all')
                      setStatusFilter('all')
                    }}
                  >
                    Limpar
                  </button>
                )}
              </div>
              {!transmission && (
                <button
                  type="button"
                  className={`highest-free-button${followHighestFree ? ' is-on' : ''}`}
                  aria-pressed={followHighestFree}
                  disabled={!highestFree}
                  onClick={() => {
                    if (followHighestFree) {
                      setFollowHighestFree(false)
                      return
                    }
                    setEndingFilter('all')
                    setStatusFilter('all')
                    setFollowHighestFree(true)
                  }}
                >
                  <ArrowUpToLine size={16} />
                  <span>
                    <b>
                      {followHighestFree
                        ? 'Acompanhando o mais alto livre'
                        : 'Mais alto livre'}
                    </b>
                    <small>
                      {highestFree
                        ? `${highestFree.floor === 0 ? 'Térreo' : `${highestFree.floor}º andar`} · apartamento ${highestFree.id}`
                        : 'Todos os apartamentos já foram selecionados'}
                    </small>
                  </span>
                </button>
              )}
              <div className="filter-row">
                <label>
                  <span>Andar</span>
                  <div className="select-wrap">
                    <select
                      value={floorFilter}
                      onChange={(event) => {
                        setFollowHighestFree(false)
                        setFloorFilter(
                          event.target.value === 'all' ? 'all' : Number(event.target.value),
                        )
                      }}
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
              readOnly={transmission}
              onSelect={transmission ? () => undefined : selectApartment}
              onActivate={transmission ? () => undefined : requestApartment}
              onClearTest={
                transmission
                  ? undefined
                  :
                currentUser.role === 'admin'
                  ? () => setClearMapOpen(true)
                  : undefined
              }
            />

          </aside>
        </main>
      )}

      {clearMapOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !clearMapBusy) {
              setClearMapOpen(false)
            }
          }}
        >
          <section
            className="admin-confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="clear-map-title"
          >
            <span className="eyebrow">Somente teste</span>
            <h3 id="clear-map-title">Limpar o mapa de {config.label}?</h3>
            <p>
              As reservas, as abdicações e a situação do sorteio no ranking
              saem agora. As parcelas e a ordem dos associados permanecem.
              O sol e as indicações do entorno também ficam.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={clearMapBusy}
                onClick={() => setClearMapOpen(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="confirm-button is-danger"
                disabled={clearMapBusy}
                onClick={() => void clearTestMap()}
              >
                <Eraser size={15} />
                {clearMapBusy ? 'Limpando…' : 'Limpar tudo'}
              </button>
            </div>
          </section>
        </div>
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
                  {pendingExisting
                    ? currentUser.role === 'admin'
                      ? 'Editar reserva confirmada'
                      : 'Alterar reserva'
                    : 'Confirmar escolha'}
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
                {lockedCurrentChoice &&
                anticipationSession?.nextSource === 'anticipator'
                  ? 'Contrato do antecipador *'
                  : lockedCurrentChoice
                    ? 'Contrato do sorteado *'
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
                  readOnly={lockedCurrentChoice}
                  onChange={(event) => {
                    setDrawnBall(event.target.value)
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
                {lockedCurrentChoice &&
                anticipationSession?.nextSource === 'anticipator'
                  ? 'Nome do antecipador'
                  : 'Nome do sorteado'}
              </span>
              <input
                value={participant}
                readOnly={lockedCurrentChoice}
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

            {pendingExisting && currentUser.role === 'admin' && (
              <p className="modal-hint">
                Reserva já confirmada. O contrato e o nome podem ser corrigidos;
                a justificativa fica no histórico.
              </p>
            )}

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
        hidden={presenting || transmission}
        boardOpen={issueBoardOpen}
        onBoardOpen={setIssueBoardOpen}
      />
    </div>
  )
}

function datetimeLocalValue(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatEventPeriod(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(iso))
}

function EventPeriodEditor({
  startsAt,
  endsAt,
  open,
  startValue,
  endValue,
  busy,
  error,
  onOpen,
  onClose,
  onStart,
  onEnd,
  onSave,
}: {
  startsAt: string
  endsAt: string
  open: boolean
  startValue: string
  endValue: string
  busy: boolean
  error: string
  onOpen: () => void
  onClose: () => void
  onStart: (value: string) => void
  onEnd: (value: string) => void
  onSave: () => void
}) {
  if (!open) {
    return (
      <button type="button" className="event-period-button" onClick={onOpen}>
        <CalendarClock size={14} />
        {formatEventPeriod(startsAt)} até {formatEventPeriod(endsAt)}
        <span>Alterar</span>
      </button>
    )
  }
  return (
    <form
      className="event-period"
      onSubmit={(event) => {
        event.preventDefault()
        onSave()
      }}
    >
      <label>
        Início
        <input
          type="datetime-local"
          value={startValue}
          onChange={(event) => onStart(event.target.value)}
        />
      </label>
      <label>
        Término
        <input
          type="datetime-local"
          value={endValue}
          onChange={(event) => onEnd(event.target.value)}
        />
      </label>
      <button type="submit" disabled={busy || !startValue || !endValue}>
        {busy ? 'Salvando…' : 'Salvar'}
      </button>
      <button type="button" onClick={onClose} disabled={busy}>
        Cancelar
      </button>
      {error && <small>{error}</small>}
    </form>
  )
}

export default App

