import { useState } from 'react'
import {
  CalendarClock,
  ChevronDown,
  CirclePlay,
  Copy,
  Link2,
  Eraser,
  LockKeyhole,
  Maximize2,
  Plus,
  RotateCcw,
  Square,
  Trash2,
  Trophy,
} from 'lucide-react'
import type {
  AnticipationEntryInput,
  AnticipationSession,
  AnticipationSessionInput,
} from '../config/anticipation'
import type { BuildingKind } from '../config/building'
import type { DrawGroup } from '../config/drawGroups'

type Props = {
  building: BuildingKind
  drawGroup?: DrawGroup
  session: AnticipationSession | null
  admin: boolean
  busy: boolean
  error: string
  onCreate: (input: AnticipationSessionInput) => Promise<void>
  onAddEntry: (input: AnticipationEntryInput) => Promise<void>
  onRemoveEntry: (entryId: string) => Promise<void>
  onResetRanking?: () => Promise<void>
  onStatus: (status: AnticipationSession['status']) => Promise<void>
  onSaveLiveUrl?: (liveUrl: string) => Promise<void>
  onSaveSlots?: (anticipatorSlots: number) => Promise<void>
  onOpenBoard?: () => void
}

const localDateTime = (date: Date) => {
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}
const defaultStart = localDateTime(new Date())
const defaultEnd = localDateTime(new Date(new Date().getTime() + 3_600_000))

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))

export function AnticipationPanel({
  building,
  drawGroup,
  session,
  admin,
  busy,
  error,
  onCreate,
  onAddEntry,
  onRemoveEntry,
  onResetRanking,
  onStatus,
  onSaveLiveUrl,
  onOpenBoard,
}: Props) {
  const [expanded, setExpanded] = useState(true)
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [liveUrl, setLiveUrl] = useState('')
  const [startsAt, setStartsAt] = useState(defaultStart)
  const [endsAt, setEndsAt] = useState(defaultEnd)
  const [entry, setEntry] = useState<AnticipationEntryInput>({
    associateCode: '',
    participant: '',
    paidInstallments: 0,
    anticipatedInstallments: 0,
    offeredInstallments: 0,
    documentTail: '',
  })
  const [copied, setCopied] = useState(false)

  const nextPosition = session?.nextAnticipator
    ? session.entries.findIndex(
        (item) => item.id === session.nextAnticipator?.id,
      ) + 1
    : 0

  return (
    <section className={`panel-section anticipation-panel ${expanded ? 'is-open' : ''}`}>
      <button
        type="button"
        className="anticipation-heading"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
      >
        <span className="anticipation-icon"><Trophy size={18} /></span>
        <div>
          <h2>Antecipadores</h2>
          <p>Ranking e ordem de escolha</p>
        </div>
        {session?.status === 'active' && (
          <span className={`turn-badge is-${session.nextSource}`}>
            Vez: {session.nextSource === 'anticipator' ? 'Antecipador' : 'Sorteio'}
          </span>
        )}
        <ChevronDown size={16} className="anticipation-chevron" />
      </button>

      {expanded && (
        <div className="anticipation-body">
          {onOpenBoard && (
            <button
              type="button"
              className="anticipation-board-link"
              onClick={onOpenBoard}
            >
              <Maximize2 size={13} /> Abrir gestão completa do ranking
            </button>
          )}
          {!session && !creating && (
            <div className="anticipation-empty">
              <p>Nenhuma sessão configurada para este grupo.</p>
              {admin && (
                <button type="button" className="secondary-button" onClick={() => setCreating(true)}>
                  <Plus size={14} /> Criar sessão
                </button>
              )}
            </div>
          )}

          {creating && !session && (
            <div className="anticipation-create-form">
              <label>
                <span>Título da sessão *</span>
                <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={`Antecipação - Grupo ${drawGroup ?? ''}`} />
              </label>
              <div className="anticipation-dates">
                <label><span>Início *</span><input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /></label>
                <label><span>Término *</span><input type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} /></label>
              </div>
              <label>
                <span>Link da live</span>
                <input value={liveUrl} onChange={(event) => setLiveUrl(event.target.value)} placeholder="https://youtube.com/..." />
              </label>
              <div className="anticipation-form-actions">
                <button type="button" className="secondary-button" onClick={() => setCreating(false)}>Cancelar</button>
                <button
                  type="button"
                  className="primary-button"
                  disabled={busy || !title.trim() || !startsAt || !endsAt}
                  onClick={() => void onCreate({
                    building,
                    drawGroup,
                    title: title.trim(),
                    startsAt: new Date(startsAt).toISOString(),
                    endsAt: new Date(endsAt).toISOString(),
                    liveUrl: liveUrl.trim(),
                  }).then(() => setCreating(false))}
                >
                  Criar ranking
                </button>
              </div>
            </div>
          )}

          {session && (
            <>
              <div className="anticipation-session-summary">
                <div><b>{session.title}</b><small><CalendarClock size={12} /> {formatDate(session.startsAt)} — {formatDate(session.endsAt)}</small></div>
                <span className={`session-status is-${session.status}`}>
                  {session.status === 'draft'
                    ? 'Antecipações abertas'
                    : session.status === 'locked'
                      ? 'Antecipações travadas'
                      : session.status === 'active'
                        ? 'Sorteio em andamento'
                        : 'Encerrada'}
                </span>
              </div>
              {session.status === 'draft' && (
                <p className="anticipation-hint">
                  Os associados informam as parcelas no portal. O ranking sobe
                  em tempo real. Depois de escolher, eles têm 1 dia para manter
                  ou recusar. Trave as antecipações ao terminar esta etapa.
                </p>
              )}
              {session.status === 'locked' && (
                <p className="anticipation-hint">
                  Ninguém pode alterar as parcelas. Reabra para corrigir ou
                  inicie o sorteio somente no dia da escolha das unidades.
                </p>
              )}
              {admin && (
                <div className="anticipation-live-row">
                  <label>
                    <span>Link da live para os associados</span>
                    <input
                      defaultValue={session.liveUrl}
                      key={session.liveUrl}
                      placeholder="https://youtube.com/live/..."
                      onBlur={(event) => {
                        const value = event.target.value.trim()
                        if (value !== session.liveUrl && onSaveLiveUrl) {
                          void onSaveLiveUrl(value)
                        }
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      const url = `${window.location.origin}/associado`
                      void navigator.clipboard.writeText(url).then(() => {
                        setCopied(true)
                        window.setTimeout(() => setCopied(false), 1800)
                      })
                    }}
                  >
                    {copied ? <Copy size={14} /> : <Link2 size={14} />}
                    {copied ? 'Link copiado' : 'Copiar portal'}
                  </button>
                </div>
              )}

              {session.status === 'active' && (
                <div className={`next-choice-card is-${session.nextSource}`}>
                  <small>PRÓXIMA ESCOLHA</small>
                  {session.nextSource === 'anticipator' ? (
                    session.nextAnticipator ? (
                      <div>
                        <strong>#{nextPosition} · {session.nextAnticipator.associateCode}</strong>
                        <span>{session.nextAnticipator.participant}</span>
                        <b>{session.nextAnticipator.totalInstallments} parcelas</b>
                      </div>
                    ) : <b>Ranking concluído</b>
                  ) : (
                    <div><strong>Sorteio</strong><span>Informe a bolinha sorteada ao escolher a unidade.</span></div>
                  )}
                </div>
              )}

              {admin && session.status === 'draft' && (
                <div className="anticipation-entry-form">
                  <input aria-label="Contrato" inputMode="numeric" maxLength={6} value={entry.associateCode} onChange={(event) => setEntry({ ...entry, associateCode: event.target.value.replace(/\D/g, '').slice(0, 6) })} placeholder="Contrato (6 dígitos)" />
                  <input aria-label="Nome" value={entry.participant} onChange={(event) => setEntry({ ...entry, participant: event.target.value })} placeholder="Nome do associado" />
                  <input aria-label="5 últimos do CPF" inputMode="numeric" maxLength={5} value={entry.documentTail} onChange={(event) => setEntry({ ...entry, documentTail: event.target.value.replace(/\D/g, '').slice(0, 5) })} placeholder="CPF (5 últimos)" />
                  <label><span>Pagas</span><input type="number" min={0} value={entry.paidInstallments} onChange={(event) => setEntry({ ...entry, paidInstallments: Number(event.target.value) })} /></label>
                  <label><span>Já antecipadas</span><input type="number" min={0} max={30} value={entry.anticipatedInstallments} onChange={(event) => setEntry({ ...entry, anticipatedInstallments: Number(event.target.value) })} /></label>
                  <label><span>Antecipando</span><input type="number" min={0} max={30} value={entry.offeredInstallments} onChange={(event) => setEntry({ ...entry, offeredInstallments: Number(event.target.value) })} /></label>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Adicionar ao ranking"
                    disabled={busy}
                    onClick={() => void onAddEntry(entry).then(() => setEntry({ associateCode: '', participant: '', paidInstallments: 0, anticipatedInstallments: 0, offeredInstallments: 0, documentTail: '' }))}
                  ><Plus size={16} /></button>
                </div>
              )}

              <div className="anticipation-ranking">
                <div className="ranking-head"><span>#</span><span>Associado</span><span>Total</span><span>Situação</span><span /></div>
                {session.entries.map((item, index) => (
                  <div className={`ranking-row is-${item.status}`} key={item.id}>
                    <b>{index + 1}</b>
                    <span><strong>{item.associateCode}</strong><small>{item.participant}</small></span>
                    <span><b>{item.totalInstallments}</b><small>{item.paidInstallments} pagas + {item.anticipatedInstallments + item.offeredInstallments} ant.</small></span>
                    <span className="ranking-status">
                      {item.status === 'waiting'
                        ? item.offerStatus === 'confirmed'
                          ? 'Confirmado'
                          : item.offerStatus === 'withdrawn'
                            ? 'Recusou parcelas'
                            : 'Aguardando'
                        : item.status === 'selected'
                          ? `Apto. ${item.apartmentId}`
                          : 'Abdicou'}
                    </span>
                    {admin && session.status === 'draft' ? (
                      <button type="button" className="icon-button" aria-label={`Remover ${item.associateCode}`} onClick={() => void onRemoveEntry(item.id)}><Trash2 size={13} /></button>
                    ) : <span />}
                  </div>
                ))}
              </div>

              {admin && (
                <div className="anticipation-session-actions">
                  {session.status === 'draft' && (
                    <button type="button" className="primary-button" disabled={busy || !session.entries.length} onClick={() => void onStatus('locked')}>
                      <LockKeyhole size={15} /> Travar antecipações
                    </button>
                  )}
                  {session.status === 'locked' && (
                    <>
                      <button type="button" className="secondary-button" disabled={busy} onClick={() => void onStatus('draft')}>
                        <RotateCcw size={14} /> Reabrir
                      </button>
                      <button type="button" className="primary-button" disabled={busy} onClick={() => void onStatus('active')}>
                        <CirclePlay size={15} /> Iniciar sorteio
                      </button>
                    </>
                  )}
                  {onResetRanking &&
                    (session.status === 'draft' || session.status === 'locked') && (
                      <button
                        type="button"
                        className="danger-button"
                        disabled={busy || !session.entries.length}
                        onClick={() => {
                          if (
                            !window.confirm(
                              'Zerar o ranking de teste? Os lances, as confirmações e as situações deste evento são apagados. Os associados e as parcelas pagas continuam na lista.',
                            )
                          ) {
                            return
                          }
                          void onResetRanking()
                        }}
                      >
                        <Eraser size={14} /> Zerar ranking de teste
                      </button>
                    )}
                  {session.status === 'active' && (
                    <>
                      <button type="button" className="danger-button" disabled={busy} onClick={() => void onStatus('closed')}>
                        <Square size={13} /> Encerrar sessão
                      </button>
                      <button type="button" className="secondary-button" disabled={busy} onClick={() => void onStatus('locked')}>
                        <LockKeyhole size={14} /> Voltar para travado
                      </button>
                    </>
                  )}
                </div>
              )}
            </>
          )}
          {error && <p className="modal-error">{error}</p>}
        </div>
      )}
    </section>
  )
}
