import { CalendarClock, History, Printer, Users } from 'lucide-react'
import type {
  AnticipationHistorySummary,
  AnticipationSession,
} from '../config/anticipation'

type Props = {
  sessions: AnticipationHistorySummary[]
  selected: AnticipationSession | null
  loading: boolean
  error: string
  onSelect: (id: string) => void
}

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))

export function AnticipationHistoryView({
  sessions,
  selected,
  loading,
  error,
  onSelect,
}: Props) {
  return (
    <section className="history-layout">
      <aside className="board-card history-sessions no-print">
        <h2>
          <History size={18} /> Sessões finalizadas
        </h2>
        <p className="board-hint">
          Selecione uma data para consultar ou imprimir o resultado.
        </p>
        {loading && !sessions.length ? (
          <p className="board-empty">Carregando histórico...</p>
        ) : error ? (
          <p className="board-alert">{error}</p>
        ) : sessions.length ? (
          <div className="history-session-list">
            {sessions.map((session) => (
              <button
                type="button"
                key={session.id}
                className={selected?.id === session.id ? 'is-active' : ''}
                onClick={() => onSelect(session.id)}
              >
                <strong>{session.title}</strong>
                <span>
                  {session.blockLabel || 'Bloco não informado'}
                  {session.drawGroup ? ` · Grupo ${session.drawGroup}` : ''}
                </span>
                <small>
                  <CalendarClock size={12} />
                  {formatDate(session.closedAt)}
                </small>
                <em>
                  {session.qualifiedCount} classificados de {session.entryCount}
                </em>
              </button>
            ))}
          </div>
        ) : (
          <p className="board-empty">Nenhuma sessão finalizada neste grupo.</p>
        )}
      </aside>

      <article className="board-card history-report">
        {selected ? (
          <>
            <header className="history-report-head">
              <div>
                <span className="eyebrow">Relatório de antecipação</span>
                <h2>{selected.title}</h2>
                <p>
                  {selected.blockLabel || 'Bloco não informado'}
                  {selected.drawGroup ? ` · Grupo ${selected.drawGroup}` : ''}
                  {' · '}
                  Finalizada em {formatDate(selected.closedAt ?? selected.endsAt)}
                </p>
              </div>
              <button
                type="button"
                className="primary-button no-print"
                onClick={() => window.print()}
              >
                <Printer size={16} /> Imprimir relatório
              </button>
            </header>

            <div className="history-stats">
              <span>
                <Users size={16} />
                <b>{selected.entries.length}</b>
                participantes
              </span>
              <span className="is-qualified">
                <b>
                  {Math.min(
                    selected.anticipatorSlots,
                    selected.entries.length,
                  )}
                </b>
                anteciparam
              </span>
              <span>
                <b>
                  {Math.max(
                    0,
                    selected.entries.length - selected.anticipatorSlots,
                  )}
                </b>
                aguardam nova rodada
              </span>
            </div>

            <div className="history-table">
              <div className="history-table-head">
                <span>#</span>
                <span>Contrato / associado</span>
                <span>Pagas</span>
                <span>Antecipando</span>
                <span>Antecipadas</span>
                <span>Total</span>
                <span>Resultado</span>
              </div>
              {selected.entries.map((entry, index) => {
                const qualified = index < selected.anticipatorSlots
                return (
                  <div
                    className={`history-table-row ${
                      qualified ? 'is-qualified' : 'is-waiting'
                    }`}
                    key={entry.id}
                  >
                    <b data-label="Posição">{index + 1}</b>
                    <span className="history-person" data-label="Associado">
                      <strong>{entry.associateCode}</strong>
                      <small>{entry.participant}</small>
                    </span>
                    <span data-label="Pagas">{entry.paidInstallments}</span>
                    <span data-label="Antecipando">
                      {entry.offeredInstallments}
                    </span>
                    <span data-label="Antecipadas">
                      {entry.anticipatedInstallments}
                    </span>
                    <b data-label="Total">{entry.totalInstallments}</b>
                    <span className="history-result" data-label="Resultado">
                      {qualified ? 'Antecipou' : 'Próxima rodada'}
                    </span>
                  </div>
                )
              })}
            </div>
          </>
        ) : (
          <div className="history-report-empty">
            <History size={30} />
            <h2>Selecione uma sessão</h2>
            <p>O relatório completo aparecerá aqui.</p>
          </div>
        )}
      </article>
    </section>
  )
}
