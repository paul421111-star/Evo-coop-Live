import type { AnticipationSession } from '../config/anticipation'

type Props = {
  session: AnticipationSession | null
  /** `canvas` fica sobre o mapa; `panel` acompanha o painel lateral. */
  variant: 'canvas' | 'panel'
}

export function TurnSign({ session, variant }: Props) {
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
        : source === 'anticipator'
          ? (session.nextAnticipator?.associateCode ?? 'Ranking concluído')
          : 'Informe a bolinha sorteada'

  return (
    <div className={`${className} is-${source}`} aria-live="polite">
      <span className="turn-sign-label">Vez atual</span>
      <strong>{label}</strong>
      <small>{hint}</small>
    </div>
  )
}
