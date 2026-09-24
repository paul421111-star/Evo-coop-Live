import { useEffect, useState } from 'react'
import { Archive, FileText, Plus, Save, Trash2, UserPlus, Users, X } from 'lucide-react'
import {
  createOperator,
  listUsers,
  removeOperator,
  type AppUser,
} from '../auth/localAuth'
import { api } from '../api/client'
import {
  BUILDING_CONFIGS,
  apartmentStorageId,
  type ApartmentStatus,
  type BuildingKind,
  type Ending,
} from '../config/building'
import type { DrawArchiveSummary } from '../config/drawArchives'
import type { DrawDecline } from '../config/drawDeclines'
import {
  drawGroupsForBuilding,
  type DrawGroup,
} from '../config/drawGroups'
import {
  EDGE_LANDMARK_OPTIONS,
  SOLAR_ILLUSTRATION_OPTIONS,
  SURROUNDING_ICON_OPTIONS,
  type EdgeLandmark,
  type EdgeLandmarksConfig,
  type SolarIllustration,
  type SolarIllustrationsConfig,
  type SurroundingIcon as IconName,
  type SurroundingItem,
  type SurroundingsConfig,
} from '../config/surroundings'
import { SurroundingIcon } from './SurroundingIcon'
import { createLocalId } from '../utils/localCrypto'
import type { ApartmentAssignments } from '../store/apartments'
import { generateBuildingPdf } from '../utils/pdfReport'

type Props = {
  surroundings: SurroundingsConfig
  solarIllustrations: SolarIllustrationsConfig
  edgeLandmarks: EdgeLandmarksConfig
  onUpdate: (
    building: BuildingKind,
    ending: Ending,
    items: SurroundingItem[],
  ) => void
  onSaveSolar: (
    building: BuildingKind,
    ending: Ending,
    illustrations: SolarIllustration[],
  ) => Promise<void>
  onSaveEdge: (
    building: BuildingKind,
    ending: Ending,
    landmarks: EdgeLandmark[],
  ) => Promise<void>
  mapBuilding: BuildingKind
  activeGroup?: DrawGroup
  assignments: ApartmentAssignments
  declines: DrawDecline[]
  onArchived: (building: BuildingKind, group?: DrawGroup) => Promise<void>
  onClose: () => void
}

export function AdminPanel({
  surroundings,
  solarIllustrations,
  edgeLandmarks,
  onUpdate,
  onSaveSolar,
  onSaveEdge,
  mapBuilding,
  activeGroup,
  assignments,
  declines,
  onArchived,
  onClose,
}: Props) {
  const [users, setUsers] = useState<AppUser[]>([])
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [userError, setUserError] = useState('')
  const [building, setBuilding] = useState<BuildingKind>('odd')
  const [solarDrafts, setSolarDrafts] = useState<SolarIllustrationsConfig>(
    () => structuredClone(solarIllustrations),
  )
  const [edgeDrafts, setEdgeDrafts] = useState<EdgeLandmarksConfig>(
    () => structuredClone(edgeLandmarks),
  )
  const [solarStatus, setSolarStatus] = useState<
    Partial<Record<string, 'saving' | 'saved' | 'error'>>
  >({})
  const [edgeStatus, setEdgeStatus] = useState<
    Partial<Record<string, 'saving' | 'saved' | 'error'>>
  >({})
  const [archives, setArchives] = useState<DrawArchiveSummary[]>([])
  const [archiveNotes, setArchiveNotes] = useState('')
  const [archiveGroup, setArchiveGroup] = useState<DrawGroup | undefined>()
  const [archiveBusy, setArchiveBusy] = useState(false)
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false)
  const [archiveError, setArchiveError] = useState('')
  const [exportingId, setExportingId] = useState<string | null>(null)

  const archiveGroups = drawGroupsForBuilding(building)
  const resolvedArchiveGroup =
    archiveGroup && archiveGroups.includes(archiveGroup)
      ? archiveGroup
      : building === mapBuilding
        ? activeGroup
        : archiveGroups[0]
  const liveReservationCount = Object.keys(assignments).filter((id) =>
    id.startsWith(`${building}:`),
  ).length
  const liveDeclineCount = declines.filter(
    (item) => item.building === building,
  ).length

  useEffect(() => {
    void listUsers().then(setUsers)
    void api
      .listDrawArchives()
      .then((payload) => setArchives(payload.archives))
      .catch(() => setArchives([]))
  }, [])

  const addUser = async () => {
    try {
      const operator = await createOperator(username, password)
      setUsers((current) => [...current, operator])
      setUsername('')
      setPassword('')
      setUserError('')
    } catch (error) {
      setUserError(
        error instanceof Error ? error.message : 'Não foi possível criar a conta.',
      )
    }
  }

  const deleteUser = async (user: AppUser) => {
    if (!window.confirm(`Remover o operador ${user.username}?`)) return
    await removeOperator(user.id)
    setUsers((current) => current.filter(({ id }) => id !== user.id))
  }

  const updateItem = (
    ending: Ending,
    id: string,
    patch: Partial<SurroundingItem>,
  ) => {
    const items = surroundings[building][ending] ?? []
    onUpdate(
      building,
      ending,
      items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    )
  }

  const removeItem = (ending: Ending, id: string) => {
    onUpdate(
      building,
      ending,
      (surroundings[building][ending] ?? []).filter((item) => item.id !== id),
    )
  }

  const addItem = (ending: Ending) => {
    const items = surroundings[building][ending] ?? []
    onUpdate(building, ending, [
      ...items,
      {
        id: createLocalId(),
        label: 'Nova indicação',
        icon: 'tree',
      },
    ])
  }

  const toggleSolarDraft = (ending: Ending, illustration: SolarIllustration) => {
    const current = solarDrafts[building][ending] ?? []
    const selected = current.includes(illustration)
      ? current.filter((item) => item !== illustration)
      : SOLAR_ILLUSTRATION_OPTIONS.map((option) => option.id).filter(
          (id) => id === illustration || current.includes(id),
        )
    const next = { ...solarDrafts[building] }
    if (selected.length) next[ending] = selected
    else delete next[ending]
    setSolarDrafts((state) => ({ ...state, [building]: next }))
    setSolarStatus((current) => {
      const nextStatus = { ...current }
      delete nextStatus[`${building}:${ending}`]
      return nextStatus
    })
  }

  const saveSolar = async (ending: Ending) => {
    const key = `${building}:${ending}`
    setSolarStatus((current) => ({ ...current, [key]: 'saving' }))
    try {
      await onSaveSolar(building, ending, solarDrafts[building][ending] ?? [])
      setSolarStatus((current) => ({ ...current, [key]: 'saved' }))
    } catch {
      setSolarStatus((current) => ({ ...current, [key]: 'error' }))
    }
  }

  const toggleEdgeDraft = (ending: Ending, landmark: EdgeLandmark) => {
    const current = edgeDrafts[building][ending] ?? []
    const selected = current.includes(landmark)
      ? current.filter((item) => item !== landmark)
      : EDGE_LANDMARK_OPTIONS.map((option) => option.id).filter(
          (id) => id === landmark || current.includes(id),
        )
    const next = { ...edgeDrafts[building] }
    if (selected.length) next[ending] = selected
    else delete next[ending]
    setEdgeDrafts((state) => ({ ...state, [building]: next }))
    setEdgeStatus((current) => {
      const nextStatus = { ...current }
      delete nextStatus[`${building}:${ending}`]
      return nextStatus
    })
  }

  const saveEdge = async (ending: Ending) => {
    const key = `${building}:${ending}`
    setEdgeStatus((current) => ({ ...current, [key]: 'saving' }))
    try {
      await onSaveEdge(building, ending, edgeDrafts[building][ending] ?? [])
      setEdgeStatus((current) => ({ ...current, [key]: 'saved' }))
    } catch {
      setEdgeStatus((current) => ({ ...current, [key]: 'error' }))
    }
  }

  const archiveLabel = `${BUILDING_CONFIGS[building].label}${
    resolvedArchiveGroup ? ` · G${resolvedArchiveGroup}` : ''
  }`

  const archiveSession = async () => {
    setArchiveBusy(true)
    setArchiveError('')
    try {
      const created = await api.closeDrawSession({
        building,
        drawGroup: resolvedArchiveGroup,
        notes: archiveNotes,
      })
      setArchives((current) => [created, ...current])
      setArchiveNotes('')
      setArchiveConfirmOpen(false)
      await onArchived(building, resolvedArchiveGroup)
    } catch (error) {
      setArchiveError(
        error instanceof Error
          ? error.message
          : 'Não foi possível arquivar o sorteio.',
      )
      setArchiveConfirmOpen(false)
    } finally {
      setArchiveBusy(false)
    }
  }

  const exportArchive = async (id: string) => {
    setExportingId(id)
    setArchiveError('')
    try {
      const archive = await api.getDrawArchive(id)
      const config = BUILDING_CONFIGS[archive.building]
      const statuses = Object.fromEntries(
        config.apartments.map((apartment) => {
          const storageId = apartmentStorageId(
            archive.building,
            apartment.id,
          )
          return [
            apartment.id,
            archive.snapshot.assignments[storageId] ? 'reserved' : 'none',
          ]
        }),
      ) as Record<string, ApartmentStatus>
      await generateBuildingPdf({
        config,
        statuses,
        assignments: archive.snapshot.assignments,
        auditLog: archive.snapshot.auditLog,
        surroundings,
        edgeLandmarks,
        declines: archive.snapshot.declines,
      })
    } catch (error) {
      setArchiveError(
        error instanceof Error
          ? error.message
          : 'Não foi possível gerar o PDF do histórico.',
      )
    } finally {
      setExportingId(null)
    }
  }

  return (
    <div className="modal-backdrop">
      <section
        className="admin-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-title"
      >
        <div className="modal-heading admin-heading">
          <div>
            <span className="eyebrow">Acesso administrativo</span>
            <h2 id="admin-title">Administração</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        <section className="admin-section">
          <div className="admin-section-title">
            <Users size={17} />
            <div>
              <h3>Operadores</h3>
              <p>Cada inclusão e alteração será registrada em seu nome.</p>
            </div>
          </div>
          <div className="new-user-row">
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Nome do usuário"
            />
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Senha inicial"
            />
            <button type="button" onClick={() => void addUser()}>
              <UserPlus size={15} /> Cadastrar
            </button>
          </div>
          {userError && <p className="admin-error">{userError}</p>}
          <div className="user-list">
            {users.map((user) => (
              <div key={user.id}>
                <span className="user-avatar">
                  {user.username.slice(0, 1).toUpperCase()}
                </span>
                <span>
                  <b>{user.username}</b>
                  <small>
                    {user.role === 'admin' ? 'Administrador' : 'Operador'}
                  </small>
                </span>
                {user.role !== 'admin' && (
                  <button
                    type="button"
                    onClick={() => void deleteUser(user)}
                    aria-label={`Remover ${user.username}`}
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="admin-section">
          <div className="admin-section-title">
            <Archive size={17} />
            <div>
              <h3>Encerrar grupo e histórico</h3>
              <p>
                Guarda reservas, abdicações e auditoria, depois limpa o mapa
                para o próximo sorteio.
              </p>
            </div>
          </div>
          <div className="archive-live-card">
            <div>
              <b>{archiveLabel}</b>
              <small>
                {liveReservationCount} reservas · {liveDeclineCount} abdicações
                no mapa ao vivo
              </small>
            </div>
            {archiveGroups.length > 0 && (
              <label>
                <span>Grupo encerrado</span>
                <select
                  value={resolvedArchiveGroup ?? ''}
                  onChange={(event) =>
                    setArchiveGroup(event.target.value as DrawGroup)
                  }
                >
                  {archiveGroups.map((group) => (
                    <option value={group} key={group}>
                      G{group}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="archive-notes">
              <span>Observação</span>
              <input
                value={archiveNotes}
                onChange={(event) => setArchiveNotes(event.target.value)}
                placeholder="Opcional, ex.: encerramento do G12"
              />
            </label>
            <button
              type="button"
              className="archive-close-button"
              disabled={archiveBusy}
              onClick={() => setArchiveConfirmOpen(true)}
            >
              <Archive size={14} />
              Arquivar e limpar mapa
            </button>
          </div>
          {archiveError && <p className="admin-error">{archiveError}</p>}
          <div className="archive-list">
            {archives.filter((item) => item.building === building).length ===
            0 ? (
              <p className="archive-empty">Nenhum grupo arquivado ainda.</p>
            ) : (
              archives
                .filter((item) => item.building === building)
                .map((item) => (
                <article key={item.id}>
                  <div>
                    <b>{item.title}</b>
                    <small>
                      {item.reservationCount} reservas · {item.declineCount}{' '}
                      abdicações ·{' '}
                      {new Intl.DateTimeFormat('pt-BR', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      }).format(new Date(item.archivedAt))}{' '}
                      · {item.archivedBy}
                    </small>
                    {item.notes && <p>{item.notes}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => void exportArchive(item.id)}
                    disabled={exportingId === item.id}
                    aria-label={`Gerar PDF de ${item.title}`}
                  >
                    <FileText size={14} />
                    {exportingId === item.id ? 'Gerando' : 'PDF'}
                  </button>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="admin-section indications-admin">
          <div className="admin-section-title">
            <SurroundingIcon icon="park" size={17} />
            <div>
              <h3>Indicações por final</h3>
              <p>Personalize ilustrações, bordas e indicações de cada final.</p>
            </div>
          </div>
          <div className="admin-building-tabs">
            {(Object.keys(BUILDING_CONFIGS) as BuildingKind[]).map((kind) => (
              <button
                type="button"
                key={kind}
                className={building === kind ? 'active' : ''}
                onClick={() => {
                  setBuilding(kind)
                  setArchiveGroup(undefined)
                }}
              >
                {BUILDING_CONFIGS[kind].label}
              </button>
            ))}
          </div>
          <div className="indication-edit-list">
            {BUILDING_CONFIGS[building].endings.map((ending) => (
              <article key={ending}>
                <header>
                  <b>Final {ending}</b>
                  <button type="button" onClick={() => addItem(ending)}>
                    <Plus size={13} /> Adicionar
                  </button>
                </header>
                <div className="solar-config-row">
                  <div
                    className="solar-option-list"
                    role="group"
                    aria-label={`Ilustrações do final ${ending}`}
                  >
                    {SOLAR_ILLUSTRATION_OPTIONS.map((option) => {
                      const checked = (
                        solarDrafts[building][ending] ?? []
                      ).includes(option.id)
                      return (
                        <label
                          className={`solar-option${checked ? ' is-active' : ''}`}
                          key={option.id}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleSolarDraft(ending, option.id)}
                          />
                          <SurroundingIcon icon={option.icon} size={13} />
                          {option.label}
                        </label>
                      )
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => void saveSolar(ending)}
                    disabled={
                      solarStatus[`${building}:${ending}`] === 'saving'
                    }
                  >
                    <Save size={13} />
                    {solarStatus[`${building}:${ending}`] === 'saving'
                      ? 'Salvando'
                      : solarStatus[`${building}:${ending}`] === 'saved'
                        ? 'Salvo'
                        : 'Salvar ilustrações'}
                  </button>
                  {solarStatus[`${building}:${ending}`] === 'error' && (
                    <small>Não foi possível salvar.</small>
                  )}
                </div>
                <div className="solar-config-row">
                  <div
                    className="solar-option-list"
                    role="group"
                    aria-label={`Informações de borda do final ${ending}`}
                  >
                    {EDGE_LANDMARK_OPTIONS.map((option) => {
                      const checked = (
                        edgeDrafts[building][ending] ?? []
                      ).includes(option.id)
                      return (
                        <label
                          className={`solar-option${checked ? ' is-active' : ''}`}
                          key={option.id}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleEdgeDraft(ending, option.id)}
                          />
                          <SurroundingIcon icon={option.icon} size={13} />
                          {option.label}
                        </label>
                      )
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => void saveEdge(ending)}
                    disabled={
                      edgeStatus[`${building}:${ending}`] === 'saving'
                    }
                  >
                    <Save size={13} />
                    {edgeStatus[`${building}:${ending}`] === 'saving'
                      ? 'Salvando'
                      : edgeStatus[`${building}:${ending}`] === 'saved'
                        ? 'Salvo'
                        : 'Salvar bordas'}
                  </button>
                  {edgeStatus[`${building}:${ending}`] === 'error' && (
                    <small>Não foi possível salvar.</small>
                  )}
                </div>
                {(surroundings[building][ending] ?? []).map((item) => (
                  <div className="indication-edit-row" key={item.id}>
                    <SurroundingIcon icon={item.icon} size={16} />
                    <input
                      value={item.label}
                      onChange={(event) =>
                        updateItem(ending, item.id, {
                          label: event.target.value,
                        })
                      }
                      aria-label={`Nome da indicação do final ${ending}`}
                    />
                    <select
                      value={item.icon}
                      onChange={(event) =>
                        updateItem(ending, item.id, {
                          icon: event.target.value as IconName,
                        })
                      }
                      aria-label={`Ícone da indicação ${item.label}`}
                    >
                      {SURROUNDING_ICON_OPTIONS.map((icon) => (
                        <option value={icon.id} key={icon.id}>
                          {icon.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => removeItem(ending, item.id)}
                      aria-label={`Remover indicação ${item.label}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </article>
            ))}
          </div>
        </section>
      </section>

      {archiveConfirmOpen && (
        <div
          className="admin-confirm-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !archiveBusy) {
              setArchiveConfirmOpen(false)
            }
          }}
        >
          <section
            className="admin-confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="archive-confirm-title"
            aria-describedby="archive-confirm-copy"
          >
            <span className="eyebrow">Confirmação necessária</span>
            <h3 id="archive-confirm-title">Encerrar {archiveLabel}?</h3>
            <p id="archive-confirm-copy">
              O mapa ao vivo será limpo para o próximo sorteio. Reservas,
              abdicações e auditoria ficam guardadas no histórico deste
              empreendimento.
            </p>
            <ul>
              <li>
                <b>{liveReservationCount}</b> reservas
              </li>
              <li>
                <b>{liveDeclineCount}</b> abdicações
              </li>
              {archiveNotes.trim() ? (
                <li>
                  Observação: <b>{archiveNotes.trim()}</b>
                </li>
              ) : null}
            </ul>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={archiveBusy}
                onClick={() => setArchiveConfirmOpen(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="confirm-button"
                disabled={archiveBusy}
                onClick={() => void archiveSession()}
              >
                <Archive size={15} />
                {archiveBusy ? 'Arquivando' : 'Arquivar e limpar'}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
