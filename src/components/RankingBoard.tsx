import { useState } from 'react'
import {
  ArrowLeft,
  CalendarClock,
  CirclePlay,
  Copy,
  Eraser,
  History,
  Link2,
  ListOrdered,
  LockKeyhole,
  Plus,
  RotateCcw,
  Square,
  Trash2,
  Trophy,
  Users,
} from 'lucide-react'
import {
  DEFAULT_ANTICIPATOR_SLOTS,
  type AnticipationEntryInput,
  type AnticipationHistorySummary,
  type AnticipationSession,
  type AnticipationSessionInput,
} from '../config/anticipation'
import { BUILDING_CONFIGS, type BuildingKind } from '../config/building'
import type { DrawGroup } from '../config/drawGroups'
import { api } from '../api/client'
import { AnticipationHistoryView } from './AnticipationHistoryView'

type Props = {
  building: BuildingKind
  drawGroup?: DrawGroup
  eventBlock: string
  session: AnticipationSession | null
  admin: boolean
  busy: boolean
  error: string
  onCreate: (input: AnticipationSessionInput) => Promise<void>
  onAddEntry: (input: AnticipationEntryInput) => Promise<void>
  onRemoveEntry: (entryId: string) => Promise<void>
  onResetRanking: () => Promise<void>
  onStatus: (status: AnticipationSession['status']) => Promise<void>
  onSaveLiveUrl: (liveUrl: string) => Promise<void>
  onSaveSlots: (anticipatorSlots: number) => Promise<void>
  onSaveConfirmationDeadline: (
    confirmationDeadline: string | null,
  ) => Promise<void>
  onOpenMap: () => void
}

const localDateTime = (date: Date) => {
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}
const defaultStart = localDateTime(new Date())
const defaultEnd = localDateTime(new Date(new Date().getTime() + 86_400_000))

const emptyEntry: AnticipationEntryInput = {
  associateCode: '',
  participant: '',
  paidInstallments: 0,
  anticipatedInstallments: 0,
  offeredInstallments: 0,
  documentTail: '',
}

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))

const CALL_ORDER_TOTAL = 224

export function RankingBoard({
  building,
  drawGroup,
  eventBlock,
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
  onSaveSlots,
  onSaveConfirmationDeadline,
  onOpenMap,
}: Props) {
  const [title, setTitle] = useState('')
  const [liveUrl, setLiveUrl] = useState('')
  const [startsAt, setStartsAt] = useState(defaultStart)
  const [endsAt, setEndsAt] = useState(defaultEnd)
  const [entry, setEntry] = useState<AnticipationEntryInput>(emptyEntry)
  const [copied, setCopied] = useState(false)
  const [slots, setSlots] = useState(DEFAULT_ANTICIPATOR_SLOTS)
  const [blockLabel, setBlockLabel] = useState(eventBlock)
  const [boardView, setBoardView] = useState<
    'ranking' | 'order' | 'history'
  >('ranking')
  const [historySessions, setHistorySessions] = useState<
    AnticipationHistorySummary[]
  >([])
  const [selectedHistory, setSelectedHistory] =
    useState<AnticipationSession | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')

  const scope = `${BUILDING_CONFIGS[building].label}${
    drawGroup ? ` · Grupo ${drawGroup}` : ''
  } · ${eventBlock}`
  const inQuota = Math.min(
    session?.entries.length ?? 0,
    session?.anticipatorSlots ?? 0,
  )
  const outQuota = (session?.entries.length ?? 0) - inQuota
  const suggestedTitle = `Antecipação · ${scope}`
  const suggestedBlock = eventBlock
  const sessionTitle = title.trim() || suggestedTitle
  const datesValid =
    Boolean(startsAt && endsAt) && new Date(endsAt) > new Date(startsAt)

  // O ranking só é confiável depois de travado; antes disso a ordem ainda muda.
  const orderLocked =
    session?.status === 'locked' || session?.status === 'active'
  const rankedAnticipators = orderLocked
    ? session.entries.slice(0, session.anticipatorSlots)
    : []
  const callOrder = Array.from({ length: CALL_ORDER_TOTAL }, (_, index) => {
    const anticipator = index % 2 === 0
    return {
      position: index + 1,
      source: anticipator ? 'anticipator' : 'draw',
      entry: anticipator ? rankedAnticipators[index / 2] : undefined,
    }
  })

  const createSession = async () => {
    if (busy || !datesValid) return
    try {
      await onCreate({
        building,
        drawGroup,
        title: sessionTitle,
        blockLabel: blockLabel.trim() || suggestedBlock,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        liveUrl: liveUrl.trim(),
        anticipatorSlots: slots,
      })
      setTitle('')
      setLiveUrl('')
    } catch {
      // A mensagem chega pela prop error.
    }
  }

  const openHistory = async () => {
    setBoardView('history')
    setHistoryLoading(true)
    setHistoryError('')
    try {
      const result = await api.listAnticipationHistory(building, drawGroup)
      setHistorySessions(result.sessions)
      if (result.sessions[0]) {
        setSelectedHistory(
          await api.getAnticipationHistory(result.sessions[0].id),
        )
      } else {
        setSelectedHistory(null)
      }
    } catch (historyLoadError) {
      setHistoryError(
        historyLoadError instanceof Error
          ? historyLoadError.message
          : 'Não foi possível carregar o histórico.',
      )
    } finally {
      setHistoryLoading(false)
    }
  }

  const selectHistory = async (id: string) => {
    setHistoryLoading(true)
    setHistoryError('')
    try {
      setSelectedHistory(await api.getAnticipationHistory(id))
    } catch (historyLoadError) {
      setHistoryError(
        historyLoadError instanceof Error
          ? historyLoadError.message
          : 'Não foi possível abrir este relatório.',
      )
    } finally {
      setHistoryLoading(false)
    }
  }

  const entryValid =
    /^\d{6}$/.test(entry.associateCode) &&
    /^\d{5}$/.test(entry.documentTail ?? '') &&
    entry.participant.trim().length > 1

  return (
    <main className="ranking-board">
      <header className="board-head">
        <div>
          <span className="eyebrow">
            {boardView === 'ranking'
              ? 'Antecipação'
              : boardView === 'order'
                ? 'Sequência do evento'
                : 'Consultas e relatórios'}
          </span>
          <h1>
            {boardView === 'ranking' ? (
              <>
                <Trophy size={22} /> Antecipação
              </>
            ) : boardView === 'order' ? (
              <>
                <ListOrdered size={22} /> Ordem de chamada
              </>
            ) : (
              <>
                <History size={22} /> Histórico de antecipações
              </>
            )}
          </h1>
          <p>{scope}</p>
        </div>
        <button type="button" className="ghost-button" onClick={onOpenMap}>
          <ArrowLeft size={15} /> Voltar ao mapa
        </button>
      </header>

      <nav className="board-view-tabs" aria-label="Visualização do ranking">
        <button
          type="button"
          className={boardView === 'ranking' ? 'is-active' : ''}
          onClick={() => setBoardView('ranking')}
        >
          <Trophy size={16} />
          Antecipação
        </button>
        <button
          type="button"
          className={boardView === 'order' ? 'is-active' : ''}
          onClick={() => setBoardView('order')}
        >
          <ListOrdered size={17} />
          Ordem de chamada
        </button>
        {admin && (
          <button
            type="button"
            className={boardView === 'history' ? 'is-active' : ''}
            onClick={() => void openHistory()}
          >
            <History size={17} />
            Histórico
          </button>
        )}
      </nav>

      {boardView === 'history' ? (
        <AnticipationHistoryView
          sessions={historySessions}
          selected={selectedHistory}
          loading={historyLoading}
          error={historyError}
          onSelect={(id) => void selectHistory(id)}
        />
      ) : boardView === 'order' ? (
        <section className="board-card call-order">
          <div className="call-order-head">
            <div>
              <span className="eyebrow">Sequência do evento</span>
              <h2>
                <ListOrdered size={19} /> Ordem de chamada
              </h2>
              <p className="board-hint">
                As chamadas alternam entre antecipador e sorteio, começando
                pelo antecipador. Cada abdicação conta entre os{' '}
                {session?.anticipatorSlots ?? 112} antecipadores. Depois disso,
                a vez fica somente no sorteio.{' '}
                {orderLocked
                  ? 'Com o ranking travado, cada chamada de antecipador já mostra o contrato correspondente.'
                  : 'Trave as antecipações para que os contratos apareçam em cada chamada.'}
              </p>
            </div>
            <div className="call-order-summary" aria-label="Resumo das chamadas">
              <span>
                <b>112</b> antecipadores
              </span>
              <span>
                <b>112</b> sorteios
              </span>
            </div>
          </div>

          <div className="call-order-legend" aria-hidden="true">
            <span className="is-anticipator">Antecipador</span>
            <span className="is-draw">Sorteio</span>
          </div>

          <ol className="call-order-list">
            {callOrder.map((item) => (
              <li key={item.position} className={`is-${item.source}`}>
                <b>{item.position}</b>
                <span>
                  <strong>
                    {item.source === 'anticipator' ? 'Antecipador' : 'Sorteio'}
                  </strong>
                  {item.source === 'anticipator' && orderLocked && (
                    <small>{item.entry?.associateCode ?? 'sem antecipador'}</small>
                  )}
                </span>
              </li>
            ))}
          </ol>
        </section>
      ) : (
        <>
          {error && <p className="board-alert">{error}</p>}

          {!session ? (
        <section className="board-card board-create">
          <h2>Criar a sessão deste grupo</h2>
          <p className="board-hint">
            A sessão define o período em que os associados podem informar
            quantas parcelas vão antecipar. Depois de criada, você libera o link
            do portal e acompanha o ranking aqui.
          </p>
          {admin ? (
            <form
              onSubmit={(event) => {
                event.preventDefault()
                void createSession()
              }}
            >
              <div className="board-form">
                <label>
                  <span>Título da sessão</span>
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder={suggestedTitle}
                  />
                </label>
                <label>
                  <span>Bloco</span>
                  <input
                    value={blockLabel}
                    onChange={(event) => setBlockLabel(event.target.value)}
                    placeholder={suggestedBlock || 'Ex.: Bloco D'}
                  />
                </label>
                <label>
                  <span>Início *</span>
                  <input
                    type="datetime-local"
                    value={startsAt}
                    onChange={(event) => setStartsAt(event.target.value)}
                  />
                </label>
                <label>
                  <span>Término *</span>
                  <input
                    type="datetime-local"
                    value={endsAt}
                    onChange={(event) => setEndsAt(event.target.value)}
                  />
                </label>
                <label>
                  <span>Vagas de antecipação *</span>
                  <input
                    type="number"
                    min={0}
                    value={slots}
                    onChange={(event) => setSlots(Number(event.target.value))}
                  />
                </label>
                <label>
                  <span>Link da live (opcional)</span>
                  <input
                    value={liveUrl}
                    onChange={(event) => setLiveUrl(event.target.value)}
                    placeholder="https://youtube.com/live/..."
                  />
                </label>
              </div>
              <div className="board-create-footer">
                <button
                  type="submit"
                  className="primary-button board-create-submit"
                  disabled={busy || !datesValid}
                >
                  <Plus size={17} />
                  {busy ? 'Criando sessão...' : 'Criar sessão'}
                </button>
                <small>
                  {datesValid
                    ? `Será criada como "${sessionTitle}", em preparação.`
                    : 'O término precisa ser depois do início.'}
                </small>
              </div>
            </form>
          ) : (
            <p className="board-empty">
              Nenhuma sessão configurada. Peça a um administrador para criar.
            </p>
          )}
        </section>
          ) : (
        <>
          <section className="board-card board-status">
            <div className="board-status-head">
              <div>
                <h2>{session.title}</h2>
                <small>
                  <CalendarClock size={13} /> {formatDate(session.startsAt)} até{' '}
                  {formatDate(session.endsAt)}
                </small>
              </div>
              <span className={`session-status is-${session.status}`}>
                {session.status === 'draft'
                  ? 'Antecipações abertas'
                  : session.status === 'locked'
                    ? 'Antecipações travadas'
                  : session.status === 'active'
                    ? 'Escolha em andamento'
                    : 'Encerrada'}
              </span>
            </div>

            <p className="board-hint">
              {session.status === 'draft'
                ? 'Os associados ainda podem informar ou alterar quantas parcelas vão antecipar. Ao terminar este dia, trave as antecipações sem iniciar o sorteio.'
                : session.status === 'locked'
                  ? 'O ranking está congelado e ninguém consegue alterar as parcelas. Você pode reabrir para correções ou iniciar o sorteio em outro dia.'
                  : 'O sorteio está em andamento e a escolha das unidades acontece no mapa. Se precisar corrigir o ranking, volte para travado.'}
            </p>

            {admin && (
              <div className="board-actions">
                {session.status === 'draft' && (
                  <>
                    <button
                      type="button"
                      className="primary-button"
                      disabled={busy || !session.entries.length}
                      onClick={() => void onStatus('locked')}
                    >
                      <LockKeyhole size={16} /> Travar antecipações
                    </button>
                    <small>
                      {session.entries.length
                        ? 'Fecha o envio de parcelas, mas não inicia o sorteio.'
                        : 'Inclua pelo menos um associado antes de travar.'}
                    </small>
                  </>
                )}
                {session.status === 'locked' && (
                  <>
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={busy}
                      onClick={() => void onStatus('draft')}
                    >
                      <RotateCcw size={15} /> Reabrir antecipações
                    </button>
                    <button
                      type="button"
                      className="primary-button"
                      disabled={busy}
                      onClick={() => void onStatus('active')}
                    >
                      <CirclePlay size={16} /> Iniciar sorteio
                    </button>
                    <small>
                      Inicie somente no dia da escolha das unidades.
                    </small>
                  </>
                )}
                {session.status === 'active' && (
                  <>
                    <button
                      type="button"
                      className="danger-button"
                      disabled={busy}
                      onClick={() => void onStatus('closed')}
                    >
                      <Square size={14} /> Encerrar sessão
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={busy}
                      onClick={() => void onStatus('locked')}
                    >
                      <LockKeyhole size={15} /> Voltar para travado
                    </button>
                    <small>
                      Encerrar é definitivo. Voltar para travado pausa o
                      sorteio e permite reabrir o cadastro.
                    </small>
                  </>
                )}
                {(session.status === 'draft' || session.status === 'locked') && (
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
                    <Eraser size={15} /> Zerar ranking de teste
                  </button>
                )}
              </div>
            )}

            {admin && session.status === 'draft' && (
              <label className="board-deadline">
                <span>
                  <CalendarClock size={14} /> Prazo para confirmar
                </span>
                <input
                  type="datetime-local"
                  key={session.confirmationDeadline ?? 'empty'}
                  defaultValue={
                    session.confirmationDeadline
                      ? localDateTime(new Date(session.confirmationDeadline))
                      : ''
                  }
                  disabled={busy}
                  onBlur={(event) => {
                    const value = event.target.value
                    const next = value ? new Date(value).toISOString() : null
                    const current = session.confirmationDeadline
                    if (next === current) return
                    if (
                      next &&
                      current &&
                      new Date(next).getTime() === new Date(current).getTime()
                    ) {
                      return
                    }
                    void onSaveConfirmationDeadline(next)
                  }}
                />
                <small>
                  Depois deste horário, quem não clicou em &quot;Manter
                  antecipação&quot; passa automaticamente para &quot;Não
                  antecipar&quot;.
                  {session.confirmationDeadline
                    ? ` Agora: ${formatDate(session.confirmationDeadline)}.`
                    : ' Sem prazo definido, vale 24 horas após o associado informar as parcelas.'}
                </small>
                {session.confirmationDeadline && (
                  <button
                    type="button"
                    className="ghost-button"
                    disabled={busy}
                    onClick={() => void onSaveConfirmationDeadline(null)}
                  >
                    Remover prazo
                  </button>
                )}
              </label>
            )}
          </section>

          {session.status === 'active' && (
            <section className={`board-card board-next is-${session.nextSource}`}>
              <span className="eyebrow">Vez atual</span>
              {session.nextSource === 'anticipator' ? (
                session.nextAnticipator ? (
                  <div>
                    <strong>
                      {session.nextAnticipator.associateCode} ·{' '}
                      {session.nextAnticipator.participant}
                    </strong>
                    <span>
                      {session.nextAnticipator.totalInstallments} parcelas no
                      total
                    </span>
                  </div>
                ) : (
                  <strong>Ranking concluído</strong>
                )
              ) : (
                <div>
                  <strong>Sorteio</strong>
                  <span>Informe a bolinha sorteada ao reservar a unidade.</span>
                </div>
              )}
              <small className="board-turn-rule">
                {session.anticipatorTurnsUsed >= session.anticipatorSlots
                  ? `As ${session.anticipatorSlots} chamadas de antecipador já foram feitas, contando abdições. A vez fica só no sorteio.`
                  : `Reservar uma unidade alterna a vez. Abdicação mantém a vez e conta nas ${session.anticipatorSlots} chamadas (${session.anticipatorTurnsUsed} já feitas).`}
              </small>
            </section>
          )}

          {admin && (
            <section className="board-card board-live">
              <h2>
                <Link2 size={17} /> Portal do associado
              </h2>
              <p className="board-hint">
                Divulgue o endereço abaixo. O associado entra com o contrato e
                os 5 últimos dígitos do CPF.
              </p>
              <div className="board-live-row">
                <label>
                  <span>Link da live</span>
                  <input
                    key={session.liveUrl}
                    defaultValue={session.liveUrl}
                    placeholder="https://youtube.com/live/..."
                    onBlur={(event) => {
                      const value = event.target.value.trim()
                      if (value !== session.liveUrl) void onSaveLiveUrl(value)
                    }}
                  />
                </label>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(`${window.location.origin}/associado`)
                      .then(() => {
                        setCopied(true)
                        window.setTimeout(() => setCopied(false), 1800)
                      })
                  }}
                >
                  <Copy size={15} />
                  {copied ? 'Link copiado' : 'Copiar link do portal'}
                </button>
              </div>
            </section>
          )}

          <section className="board-card board-ranking">
            <h2>
              <Users size={17} />
              {`Antecipação · ${session.entries.length} ${
                session.entries.length === 1 ? 'associado' : 'associados'
              }`}
            </h2>
            <p className="board-hint">
              Ordena pelo total de parcelas. Em caso de empate, o menor número
              de contrato fica na frente. As{' '}
              <b>{session.anticipatorSlots} primeiras posições</b> aparecem
              destacadas: são os antecipadores. Da linha seguinte para baixo
              ficam fora da antecipação.
            </p>

            {admin && (
              <label className="board-slots">
                <span>Vagas de antecipação</span>
                <input
                  type="number"
                  min={0}
                  key={session.anticipatorSlots}
                  defaultValue={session.anticipatorSlots}
                  onBlur={(event) => {
                    const value = Number(event.target.value)
                    if (
                      Number.isInteger(value) &&
                      value >= 0 &&
                      value !== session.anticipatorSlots
                    ) {
                      void onSaveSlots(value)
                    }
                  }}
                />
                <small>
                  {inQuota} de {session.anticipatorSlots} vagas preenchidas
                  {outQuota > 0 ? ` · ${outQuota} fora` : ''}
                </small>
              </label>
            )}

            {admin && session.status === 'draft' && (
              <div className="board-entry-form">
                <label>
                  <span>Contrato</span>
                  <input
                    inputMode="numeric"
                    maxLength={6}
                    value={entry.associateCode}
                    onChange={(event) =>
                      setEntry({
                        ...entry,
                        associateCode: event.target.value
                          .replace(/\D/g, '')
                          .slice(0, 6),
                      })
                    }
                    placeholder="000000"
                  />
                </label>
                <label className="is-wide">
                  <span>Nome do associado</span>
                  <input
                    value={entry.participant}
                    onChange={(event) =>
                      setEntry({ ...entry, participant: event.target.value })
                    }
                    placeholder="Nome completo"
                  />
                </label>
                <label>
                  <span>CPF (5 últimos)</span>
                  <input
                    inputMode="numeric"
                    maxLength={5}
                    value={entry.documentTail}
                    onChange={(event) =>
                      setEntry({
                        ...entry,
                        documentTail: event.target.value
                          .replace(/\D/g, '')
                          .slice(0, 5),
                      })
                    }
                    placeholder="00000"
                  />
                </label>
                <label>
                  <span>Pagas</span>
                  <input
                    type="number"
                    min={0}
                    value={entry.paidInstallments}
                    onChange={(event) =>
                      setEntry({
                        ...entry,
                        paidInstallments: Number(event.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  <span>Já antecipadas</span>
                  <input
                    type="number"
                    min={0}
                    max={30}
                    value={entry.anticipatedInstallments}
                    onChange={(event) =>
                      setEntry({
                        ...entry,
                        anticipatedInstallments: Number(event.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  <span>Antecipando</span>
                  <input
                    type="number"
                    min={0}
                    max={30}
                    value={entry.offeredInstallments}
                    onChange={(event) =>
                      setEntry({
                        ...entry,
                        offeredInstallments: Number(event.target.value),
                      })
                    }
                  />
                </label>
                <button
                  type="button"
                  className="primary-button"
                  disabled={busy || !entryValid}
                  onClick={() =>
                    void onAddEntry(entry).then(() => setEntry(emptyEntry))
                  }
                >
                  <Plus size={15} /> Incluir
                </button>
              </div>
            )}

            {session.entries.length ? (
              <div className="board-table">
                <div className="board-table-head">
                  <span>#</span>
                  <span>Associado</span>
                  <span>Pagas</span>
                  <span>Antecipando</span>
                  <span>Antecipadas</span>
                  <span>Total</span>
                  <span>Situação</span>
                  <span />
                </div>
                {session.entries.map((item, index) => (
                  <div
                    className={`board-table-row is-${item.status}${
                      index < session.anticipatorSlots
                        ? ' is-anticipator'
                        : ' is-outside'
                    }${index === session.anticipatorSlots - 1 ? ' is-cut' : ''}`}
                    key={item.id}
                  >
                    <b>{index + 1}</b>
                    <span className="board-person">
                      <strong>{item.participant}</strong>
                      <small>Contrato {item.associateCode}</small>
                    </span>
                    <span className="board-installment" data-label="Pagas">
                      {item.paidInstallments}
                    </span>
                    <span
                      className="board-installment"
                      data-label="Antecipando"
                    >
                      {item.offeredInstallments}
                    </span>
                    <span
                      className="board-installment"
                      data-label="Antecipadas"
                    >
                      {item.anticipatedInstallments}
                    </span>
                    <b className="board-total">{item.totalInstallments}</b>
                    <span className="board-state">
                      {item.status === 'selected'
                        ? `Apartamento ${item.apartmentId}`
                        : item.status === 'declined'
                          ? 'Abdicou'
                          : item.offerStatus === 'confirmed'
                            ? 'Confirmado'
                            : item.offerStatus === 'withdrawn'
                              ? 'Não vai antecipar'
                              : 'Aguardando'}
                    </span>
                    {admin && session.status === 'draft' ? (
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Remover ${item.associateCode}`}
                        onClick={() => void onRemoveEntry(item.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    ) : (
                      <span />
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="board-empty">
                Nenhum associado no ranking ainda. Inclua pelo formulário acima
                ou aguarde as antecipações pelo portal.
              </p>
            )}
          </section>
        </>
          )}
        </>
      )}
    </main>
  )
}
