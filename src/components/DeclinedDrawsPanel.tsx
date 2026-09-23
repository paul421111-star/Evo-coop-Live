import { useState } from 'react'
import { PhoneOff, Plus, X } from 'lucide-react'
import {
  DECLINE_REASON_BY_ID,
  DECLINE_REASON_OPTIONS,
  type DrawDecline,
  type DrawDeclineReason,
} from '../config/drawDeclines'

type Props = {
  items: DrawDecline[]
  busy: boolean
  error: string
  onAdd: (input: {
    ball: string
    participant: string
    reason: DrawDeclineReason
    notes: string
  }) => Promise<boolean>
  onRemove: (id: string) => Promise<void>
}

export function DeclinedDrawsPanel({
  items,
  busy,
  error,
  onAdd,
  onRemove,
}: Props) {
  const [ball, setBall] = useState('')
  const [participant, setParticipant] = useState('')
  const [reason, setReason] = useState<DrawDeclineReason>('refused')
  const [notes, setNotes] = useState('')

  const submit = async () => {
    const saved = await onAdd({
      ball: ball.trim(),
      participant: participant.trim(),
      reason,
      notes: notes.trim(),
    })
    if (!saved) return
    setBall('')
    setParticipant('')
    setNotes('')
    setReason('refused')
  }

  return (
    <section className="panel-section declined-section">
      <div className="section-heading compact">
        <h2>
          <PhoneOff size={16} /> Não aceitaram
        </h2>
        <span className="declined-count">{items.length}</span>
      </div>
      <p className="declined-hint">
        Registre bolinhas que recusaram, deixaram para a próxima torre ou não
        atenderam o celular.
      </p>

      <div className="declined-form">
        <label>
          <span>Bolinha *</span>
          <input
            value={ball}
            onChange={(event) => setBall(event.target.value)}
            placeholder="Ex.: 127"
            onKeyDown={(event) => {
              if (event.key === 'Enter') void submit()
            }}
          />
        </label>
        <label>
          <span>Nome</span>
          <input
            value={participant}
            onChange={(event) => setParticipant(event.target.value)}
            placeholder="Opcional"
          />
        </label>
        <label className="declined-reason">
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
        <label className="declined-notes">
          <span>Observação</span>
          <input
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Opcional"
          />
        </label>
        <button
          type="button"
          className="declined-add-button"
          disabled={busy}
          onClick={() => void submit()}
        >
          <Plus size={14} />
          Registrar
        </button>
      </div>

      {error && <p className="modal-error">{error}</p>}

      {items.length > 0 && (
        <ul className="declined-list">
          {items.map((item) => (
            <li key={item.id}>
              <div>
                <b>Bolinha {item.ball}</b>
                <span>
                  {item.participant || 'Sem nome'} ·{' '}
                  {DECLINE_REASON_BY_ID[item.reason]}
                </span>
                {item.notes && <small>{item.notes}</small>}
                <small>Incluído por {item.createdBy}</small>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label={`Remover bolinha ${item.ball}`}
                disabled={busy}
                onClick={() => void onRemove(item.id)}
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
