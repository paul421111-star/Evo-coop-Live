import type { AnticipationSession } from '../config/anticipation'

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
}

export function DrawnBallField({
  group,
  ball,
  code,
  name,
  onChange,
}: {
  group?: string
  ball: string
  code?: string | null
  name?: string
  onChange: (value: string) => void
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
      />
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
}: Props) {
  const source = session?.status === 'active' ? session.nextSource : 'idle'
  const className =
    variant === 'canvas' ? 'canvas-turn-sign' : 'overview-turn'
  const label = !session
    ? 'Sem sessão'
    : session.status === 'draft'
      ? 'Antecipações abertas'
      : session.status === 'locked'
        ? 'Ranking travado'
        : source === 'anticipator'
          ? 'Antecipador'
          : 'Sorteio'
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
              : 'Digite o número do sorteado'
  const showNext = session?.status === 'active' && Boolean(onNext)
  const editingDraw =
    source === 'draw' && !session?.awaitingNext && Boolean(onDrawnBallChange)

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
          />
        ) : (
          <small>{hint}</small>
        )}
      </div>
      {showNext && (
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
      )}
    </div>
  )
}
