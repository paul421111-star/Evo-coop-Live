import { useEffect, useState } from 'react'
import { turnCallLabel, type AnticipationSession } from '../config/anticipation'
import type { DrawDeclineReason } from '../config/drawDeclines'
import { ContractDigits } from './contractDigits'

type Props = {
  session: AnticipationSession | null
  /** `canvas` fica sobre o mapa; `panel` acompanha o painel lateral. */
  variant: 'canvas' | 'panel'
  onNext?: () => void
  nextBusy?: boolean
  drawnGroup?: string
  drawnBall?: string
  drawnCode?: string | null
  drawnName?: string
  onDrawnBallChange?: (value: string) => void
  onSendDraw?: () => void
  /** O número digitado já é o que está na live. */
  drawSent?: boolean
  /** Reservas de sorteio já gravadas neste grupo. */
  drawReservations?: number
  onAbdicate?: (reason: Extract<DrawDeclineReason, 'refused' | 'no-answer'>) => void
  abdicateBusy?: boolean
  abdicateError?: string
}

export function DrawnBallField({
  group,
  ball,
  code,
  name,
  onChange,
  onSend,
  sent = false,
}: {
  group?: string
  ball: string
  code?: string | null
  name?: string
  onChange: (value: string) => void
  onSend?: () => void
  sent?: boolean
}) {
  return (
    <span className="drawn-ball-field">
      {group && <b>{group}</b>}
      <input
        inputMode="numeric"
        maxLength={group ? 4 : 6}
        value={ball}
        placeholder={group ? '0001' : 'Contrato'}
        aria-label="Número do sorteado"
        onChange={(event) =>
          onChange(
            group
              ? event.target.value.replace(/\D/g, '').slice(0, 4)
              : event.target.value,
          )
        }
        onKeyDown={(event) => {
          if (event.key === 'Enter' && onSend && code && !sent) onSend()
        }}
      />
      {onSend && (
        <button
          type="button"
          className="drawn-ball-send"
          disabled={!code || sent}
          onClick={onSend}
          title={
            sent
              ? 'Este número já está na live'
              : 'Mandar este número para a live'
          }
        >
          {sent ? 'Na live' : 'Enviar'}
        </button>
      )}
      {code && (
        <span className="drawn-ball-code">
          {name ? `${code} · ${name}` : code}
        </span>
      )}
    </span>
  )
}

export function TurnSign({
  session,
  variant,
  onNext,
  nextBusy,
  drawnGroup,
  drawnBall = '',
  drawnCode,
  drawnName = '',
  onDrawnBallChange,
  onSendDraw,
  drawSent = false,
  drawReservations = 0,
  onAbdicate,
  abdicateBusy = false,
  abdicateError = '',
}: Props) {
  const [confirmingAbdication, setConfirmingAbdication] = useState(false)
  const source = session?.status === 'active' ? session.nextSource : 'idle'
  const className =
    variant === 'canvas' ? 'canvas-turn-sign' : 'overview-turn'
  const label = !session
    ? 'Sem sessão'
    : session.status === 'draft'
      ? 'Antecipações abertas'
      : session.status === 'locked'
        ? 'Ranking travado'
        : source === 'anticipator' || source === 'draw'
          ? turnCallLabel({
              source,
              anticipatorTurnsUsed: session.anticipatorTurnsUsed,
              drawReservations,
              awaitingNext: session.awaitingNext,
            })
          : 'Encerrado'
  const hint = !session
    ? 'Crie a sessão no ranking'
    : session.status === 'draft'
      ? 'Associados ainda podem alterar parcelas'
      : session.status === 'locked'
        ? 'Reabra ou inicie o sorteio'
        : session.awaitingNext
          ? drawnCode
            ? `${drawnCode} reservado. Próximo troca a plaquinha.`
            : 'Reserva feita. Próximo troca a plaquinha.'
          : source === 'anticipator'
            ? (session.nextAnticipator?.associateCode ?? 'Ranking concluído')
            : drawnCode
              ? drawnName
                ? `${drawnCode} · ${drawnName}`
                : drawnCode
              : onDrawnBallChange
                ? 'Digite o número do sorteado'
                : 'Aguardando número sorteado'
  const showNext = session?.status === 'active' && Boolean(onNext)
  const editingDraw =
    source === 'draw' && !session?.awaitingNext && Boolean(onDrawnBallChange)
  const numberCode =
    source === 'anticipator'
      ? (session?.nextAnticipator?.associateCode ?? '')
      : (drawnCode ?? '')
  const showNumber = /^\d{6}$/.test(numberCode) && !editingDraw
  const abdicationBall =
    source === 'anticipator'
      ? (session?.nextAnticipator?.associateCode ?? '')
      : (drawnCode ?? '')
  const canAbdicate =
    Boolean(onAbdicate) &&
    session?.status === 'active' &&
    !session.awaitingNext &&
    /^\d{6}$/.test(abdicationBall)
  const abdicationHint = session?.awaitingNext
    ? 'Desfaça a reserva ou passe para o próximo antes de abdicar.'
    : 'Digite a bolinha antes de abdicar.'

  useEffect(() => {
    setConfirmingAbdication(false)
  }, [abdicationBall, session?.awaitingNext, source])

  return (
    <div className={`${className} is-${source}`} aria-live="polite">
      <div className="turn-sign-copy">
        <span className="turn-sign-label">Vez atual</span>
        <strong>{label}</strong>
        {editingDraw ? (
          <DrawnBallField
            group={drawnGroup}
            ball={drawnBall}
            code={drawnCode}
            name={drawnName}
            onChange={onDrawnBallChange!}
            onSend={onSendDraw}
            sent={drawSent}
          />
        ) : showNumber ? (
          <span className="turn-sign-number">
            <ContractDigits code={numberCode} />
          </span>
        ) : (
          <small>{hint}</small>
        )}
        {showNumber && source === 'anticipator' && session?.nextAnticipator?.participant && (
          <small>{session.nextAnticipator.participant}</small>
        )}
        {showNumber && source === 'draw' && drawnName && <small>{drawnName}</small>}
        {showNumber && session?.awaitingNext && (
          <small>Próximo troca a plaquinha.</small>
        )}
      </div>
      {showNext && (
        <div className="turn-sign-actions">
          <button
            type="button"
            className="turn-next-button"
            disabled={!session.awaitingNext || nextBusy}
            onClick={onNext}
            title={
              session.awaitingNext
                ? 'Troca a plaquinha para a próxima vez'
                : 'Confirme a reserva para liberar o Próximo'
            }
          >
            Próximo
          </button>
          {onAbdicate &&
            (confirmingAbdication ? (
              <div className="turn-abdicate-choices" role="group">
                <span className="turn-abdicate-prompt">
                  Confirma a abdicação?
                </span>
                <button
                  type="button"
                  className="turn-abdicate-choice"
                  disabled={abdicateBusy}
                  onClick={() => onAbdicate('no-answer')}
                >
                  Não atendeu
                </button>
                <button
                  type="button"
                  className="turn-abdicate-choice is-refused"
                  disabled={abdicateBusy}
                  onClick={() => onAbdicate('refused')}
                >
                  Abdicou
                </button>
                <button
                  type="button"
                  className="turn-abdicate-cancel"
                  disabled={abdicateBusy}
                  onClick={() => setConfirmingAbdication(false)}
                >
                  Cancelar
                </button>
                {abdicateError && (
                  <span className="turn-abdicate-error">{abdicateError}</span>
                )}
              </div>
            ) : (
              <button
                type="button"
                className="turn-abdicate-button"
                disabled={!canAbdicate || abdicateBusy}
                title={canAbdicate ? 'Registrar a abdicação desta vez' : abdicationHint}
                onClick={() => setConfirmingAbdication(true)}
              >
                Abdicação
              </button>
            ))}
        </div>
      )}
    </div>
  )
}
