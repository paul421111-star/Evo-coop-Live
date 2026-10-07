import { useEffect, useMemo, useState } from 'react'
import { Bug, Kanban, Plus, X } from 'lucide-react'
import { api } from '../api/client'
import {
  ISSUE_KIND_LABEL,
  ISSUE_PRIORITY_LABEL,
  ISSUE_STAGE_LABEL,
  type IssueKind,
  type IssuePriority,
  type IssueStage,
  type ProductIssue,
} from '../config/issues'

type Props = {
  admin: boolean
  place: string
  hidden?: boolean
  boardOpen: boolean
  onBoardOpen: (open: boolean) => void
}

const STAGES: IssueStage[] = ['backlog', 'doing', 'done']

const emptyForm = {
  title: '',
  kind: 'falha' as IssueKind,
  priority: 'media' as IssuePriority,
  context: '',
  expected: '',
}

function formatWhen(value: string) {
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function IssueDesk({
  admin,
  place,
  hidden = false,
  boardOpen,
  onBoardOpen,
}: Props) {
  const [reportOpen, setReportOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [issues, setIssues] = useState<ProductIssue[]>([])
  const [query, setQuery] = useState('')
  const [kindFilter, setKindFilter] = useState<IssueKind | 'all'>('all')
  const [priorityFilter, setPriorityFilter] = useState<IssuePriority | 'all'>(
    'all',
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const loadIssues = async () => {
    const rows = await api.issues()
    setIssues(rows)
  }

  useEffect(() => {
    if (!boardOpen || !admin) return
    void loadIssues().catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : 'Falha ao carregar.')
    })
  }, [admin, boardOpen])

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase()
    return issues.filter((issue) => {
      if (kindFilter !== 'all' && issue.kind !== kindFilter) return false
      if (priorityFilter !== 'all' && issue.priority !== priorityFilter) {
        return false
      }
      if (!term) return true
      return (
        issue.title.toLowerCase().includes(term) ||
        issue.context.toLowerCase().includes(term) ||
        issue.authorName.toLowerCase().includes(term) ||
        String(issue.number).includes(term)
      )
    })
  }, [issues, kindFilter, priorityFilter, query])

  const submit = async () => {
    setBusy(true)
    setError('')
    try {
      const created = await api.createIssue({ ...form, place })
      setForm(emptyForm)
      setReportOpen(false)
      setNotice(`Problema #${created.number} enviado para o backlog.`)
      if (admin && boardOpen) setIssues((current) => [created, ...current])
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível enviar.')
    } finally {
      setBusy(false)
    }
  }

  const move = async (issue: ProductIssue, stage: IssueStage) => {
    setError('')
    try {
      const updated = await api.updateIssue(issue.id, { stage })
      setIssues((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      )
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível atualizar.')
    }
  }

  if (hidden) return null

  return (
    <>
      <div className="issue-dock">
        {admin && (
          <button
            type="button"
            className="issue-roadmap-button"
            onClick={() => onBoardOpen(true)}
          >
            <Kanban size={15} />
            Roadmap
          </button>
        )}
        <button
          type="button"
          className="issue-report-button"
          onClick={() => {
            setError('')
            setNotice('')
            setReportOpen(true)
          }}
        >
          <Bug size={15} />
          Reportar problema
        </button>
      </div>

      {notice && !reportOpen && !boardOpen && (
        <p className="issue-toast" role="status">
          {notice}
        </p>
      )}

      {reportOpen && (
        <div className="modal-backdrop" onClick={() => setReportOpen(false)}>
          <form
            className="issue-report-dialog"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault()
              void submit()
            }}
          >
            <header>
              <div>
                <span>Evo Coop Live</span>
                <h2>Reportar problema</h2>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setReportOpen(false)}
                aria-label="Fechar"
              >
                <X size={16} />
              </button>
            </header>
            <label>
              Título
              <input
                value={form.title}
                maxLength={180}
                required
                placeholder="O que precisa de atenção"
                onChange={(event) =>
                  setForm((current) => ({ ...current, title: event.target.value }))
                }
              />
            </label>
            <div className="issue-form-row">
              <label>
                Tipo
                <select
                  value={form.kind}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      kind: event.target.value as IssueKind,
                    }))
                  }
                >
                  <option value="falha">Falha</option>
                  <option value="melhoria">Melhoria</option>
                </select>
              </label>
              <label>
                Prioridade
                <select
                  value={form.priority}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      priority: event.target.value as IssuePriority,
                    }))
                  }
                >
                  <option value="baixa">Baixa</option>
                  <option value="media">Média</option>
                  <option value="alta">Alta</option>
                </select>
              </label>
            </div>
            <label>
              O que aconteceu
              <textarea
                value={form.context}
                required
                maxLength={2000}
                rows={4}
                placeholder="Onde estava e o que fez quando percebeu"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    context: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              Comportamento esperado
              <textarea
                value={form.expected}
                maxLength={2000}
                rows={3}
                placeholder="Como deveria funcionar"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    expected: event.target.value,
                  }))
                }
              />
            </label>
            <small className="issue-place">Registrado em {place}</small>
            {error && <p className="form-error">{error}</p>}
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setReportOpen(false)}
              >
                Cancelar
              </button>
              <button type="submit" className="confirm-button" disabled={busy}>
                Enviar ao backlog
              </button>
            </div>
          </form>
        </div>
      )}

      {boardOpen && admin && (
        <div className="issue-board-shell">
          <header className="issue-board-top">
            <div>
              <span>Evo Coop Live</span>
              <h2>Roadmap e issues</h2>
            </div>
            <div className="issue-board-actions">
              <button
                type="button"
                className="confirm-button"
                onClick={() => {
                  setError('')
                  setReportOpen(true)
                }}
              >
                <Plus size={15} /> Novo item
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => onBoardOpen(false)}
              >
                Fechar
              </button>
            </div>
          </header>
          <div className="issue-board-filters">
            <input
              value={query}
              placeholder="Buscar por título, relato ou autor"
              onChange={(event) => setQuery(event.target.value)}
            />
            <select
              value={kindFilter}
              onChange={(event) =>
                setKindFilter(event.target.value as IssueKind | 'all')
              }
            >
              <option value="all">Todos os tipos</option>
              <option value="falha">Falha</option>
              <option value="melhoria">Melhoria</option>
            </select>
            <select
              value={priorityFilter}
              onChange={(event) =>
                setPriorityFilter(event.target.value as IssuePriority | 'all')
              }
            >
              <option value="all">Todas as prioridades</option>
              <option value="alta">Alta</option>
              <option value="media">Média</option>
              <option value="baixa">Baixa</option>
            </select>
          </div>
          {error && <p className="form-error">{error}</p>}
          <div className="issue-columns">
            {STAGES.map((stage) => {
              const column = visible.filter((issue) => issue.stage === stage)
              return (
                <section key={stage} className={`issue-column is-${stage}`}>
                  <header>
                    <div>
                      <h3>{ISSUE_STAGE_LABEL[stage]}</h3>
                      <small>
                        {stage === 'backlog'
                          ? 'Aguardando priorização'
                          : stage === 'doing'
                            ? 'Em execução'
                            : 'Já tratado'}
                      </small>
                    </div>
                    <b>{column.length}</b>
                  </header>
                  <div className="issue-column-list">
                    {column.map((issue) => (
                      <article key={issue.id} className="issue-card">
                        <div className="issue-card-meta">
                          <span className={`issue-kind is-${issue.kind}`}>
                            {ISSUE_KIND_LABEL[issue.kind]}
                          </span>
                          <span className={`issue-priority is-${issue.priority}`}>
                            {ISSUE_PRIORITY_LABEL[issue.priority]}
                          </span>
                        </div>
                        <h4>
                          #{issue.number} · {issue.title}
                        </h4>
                        <p>{issue.context}</p>
                        {issue.expected && (
                          <p className="issue-expected">
                            Esperado: {issue.expected}
                          </p>
                        )}
                        <footer>
                          <span>
                            {issue.authorName} · {formatWhen(issue.createdAt)}
                          </span>
                          {issue.place && <small>{issue.place}</small>}
                        </footer>
                        <div className="issue-card-actions">
                          {stage !== 'backlog' && (
                            <button type="button" onClick={() => void move(issue, 'backlog')}>
                              Backlog
                            </button>
                          )}
                          {stage !== 'doing' && (
                            <button type="button" onClick={() => void move(issue, 'doing')}>
                              Desenvolver
                            </button>
                          )}
                          {stage !== 'done' && (
                            <button type="button" onClick={() => void move(issue, 'done')}>
                              Concluir
                            </button>
                          )}
                        </div>
                      </article>
                    ))}
                    {column.length === 0 && (
                      <p className="issue-empty">Nenhum item nesta etapa.</p>
                    )}
                  </div>
                </section>
              )
            })}
          </div>
        </div>
      )}
    </>
  )
}
