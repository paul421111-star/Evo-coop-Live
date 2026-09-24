import { useMemo, useState } from 'react'
import { ChevronDown, Plus, Search, UserRoundX, X } from 'lucide-react'
import {
  DECLINE_REASON_BY_ID,
  DECLINE_REASON_OPTIONS,
  DECLINE_SOURCE_BY_ID,
  DECLINE_SOURCE_OPTIONS,
  type DrawDecline,
  type DrawDeclineReason,
  type DrawDeclineSource,
} from '../config/drawDeclines'
import {
  buildAssociateCode,
  parseAssociateCode,
  type DrawGroup,
} from '../config/drawGroups'
import type { BuildingKind } from '../config/building'

type Props = {
  building: BuildingKind
  activeGroup?: DrawGroup
  items: DrawDecline[]
  busy: boolean
  error: string
  onAdd: (input: {
    ball: string
    participant: string
    source: DrawDeclineSource
    reason: DrawDeclineReason
    notes: string
  }) => Promise<boolean>
  onRemove: (id: string) => Promise<void>
}

export function DeclinedDrawsPanel({
  building,
  activeGroup,
  items,
  busy,
  error,
  onAdd,
  onRemove,
}: Props) {
  const [ball, setBall] = useState('')
  const [participant, setParticipant] = useState('')
  const [source, setSource] = useState<DrawDeclineSource>('draw')
  const [reason, setReason] = useState<DrawDeclineReason>('refused')
  const [notes, setNotes] = useState('')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState(false)

  const visibleItems = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('pt-BR')
    if (!query) return items
    return items.filter((item) =>
      [
        item.ball,
        item.participant,
        DECLINE_SOURCE_BY_ID[item.source],
        DECLINE_REASON_BY_ID[item.reason],
      ].some((value) => value.toLocaleLowerCase('pt-BR').includes(query)),
    )
  }, [items, search])

  const submit = async () => {
    const associateCode = activeGroup
      ? buildAssociateCode(activeGroup, ball)
      : ball.trim()
    const saved = await onAdd({
      ball: associateCode ?? '',
      participant: participant.trim(),
      source,
      reason,
      notes: notes.trim(),
    })
    if (!saved) return
    setBall('')
    setParticipant('')
    setNotes('')
    setSource('draw')
    setReason('refused')
    setExpanded(true)
  }

  return (
    <section
      className={`panel-section abdication-section ${expanded ? 'is-open' : ''}`}
    >
      <button
        type="button"
        className="abdication-heading"
        aria-expanded={expanded}
        onClick={() => setExpanded((open) => !open)}
      >
        <span className="abdication-icon">
          <UserRoundX size={18} />
        </span>
        <div>
          <h2>Lista de Abdicação</h2>
          <p>Sorteados que não seguiram com a escolha nesta etapa.</p>
        </div>
        <span className="abdication-count">
          {items.length} {items.length === 1 ? 'registro' : 'registros'}
        </span>
        <ChevronDown size={16} className="abdication-chevron" />
      </button>

      {expanded && (
        <>
      <div className="abdication-form">
        <label>
          <span>{activeGroup ? 'Bolinha sorteada *' : 'Código associado *'}</span>
          <div className={activeGroup ? 'associate-code-input' : undefined}>
            {activeGroup && <b>{activeGroup}</b>}
            <input
              value={ball}
              inputMode={activeGroup ? 'numeric' : undefined}
              maxLength={activeGroup ? 4 : undefined}
              onChange={(event) =>
                setBall(
                  activeGroup
                    ? event.target.value.replace(/\D/g, '').slice(0, 4)
                    : event.target.value,
                )
              }
              placeholder={activeGroup ? '0001' : 'Ex.: 110396'}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void submit()
              }}
            />
          </div>
          {activeGroup && (
            <small className="associate-code-preview">
              Código associado:{' '}
              <b>{buildAssociateCode(activeGroup, ball) ?? `${activeGroup}----`}</b>
            </small>
          )}
        </label>
        <label>
          <span>Nome</span>
          <input
            value={participant}
            onChange={(event) => setParticipant(event.target.value)}
            placeholder="Opcional"
          />
        </label>
        <label>
          <span>Origem *</span>
          <select
            value={source}
            onChange={(event) =>
              setSource(event.target.value as DrawDeclineSource)
            }
          >
            {DECLINE_SOURCE_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Motivo *</span>
          <select
            value={reason}
            onChange={(event) =>
              setReason(event.target.value as DrawDeclineReason)
            }
          >
            {DECLINE_REASON_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="abdication-notes">
          <span>Observação</span>
          <input
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Opcional"
          />
        </label>
        <button
          type="button"
          className="abdication-add-button"
          disabled={busy}
          onClick={() => void submit()}
        >
          <Plus size={14} />
          Adicionar à lista
        </button>
      </div>

      {error && <p className="modal-error">{error}</p>}

      <div className="abdication-list-toolbar">
        <b>Registros recentes</b>
        <label>
          <Search size={13} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar código ou nome"
          />
        </label>
      </div>

      {visibleItems.length > 0 ? (
        <ul className="abdication-list">
          {visibleItems.map((item) => (
            <li key={item.id}>
              <span className="abdication-ball">
                {item.ball}
                {parseAssociateCode(building, item.ball) && (
                  <small>
                    G{parseAssociateCode(building, item.ball)?.group} · Bolinha{' '}
                    {parseAssociateCode(building, item.ball)?.ball}
                  </small>
                )}
              </span>
              <div className="abdication-details">
                <div>
                  <b>{item.participant || 'Participante não informado'}</b>
                  <span className={`abdication-reason is-${item.reason}`}>
                    {DECLINE_REASON_BY_ID[item.reason]}
                  </span>
                </div>
                <small>
                  {DECLINE_SOURCE_BY_ID[item.source]} ·{' '}
                  {new Intl.DateTimeFormat('pt-BR', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  }).format(new Date(item.createdAt))}
                </small>
                {item.notes && <p>{item.notes}</p>}
                <small>Registrado por {item.createdBy}</small>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label={`Remover associado ${item.ball}`}
                disabled={busy}
                onClick={() => void onRemove(item.id)}
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="abdication-empty">
          {items.length
            ? 'Nenhum registro corresponde à busca.'
            : 'Nenhuma abdicação registrada neste empreendimento.'}
        </div>
      )}
        </>
      )}
    </section>
  )
}
