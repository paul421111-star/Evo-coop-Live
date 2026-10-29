type Props = {
  canAccess: boolean
  canParticipate: boolean
  busy: boolean
  onChange: (policy: {
    delinquentCanAccess?: boolean
    delinquentCanParticipate?: boolean
  }) => void
}

export function DelinquentPolicy({
  canAccess,
  canParticipate,
  busy,
  onChange,
}: Props) {
  return (
    <div className="delinquent-policy">
      <button
        type="button"
        className={canAccess ? 'is-on' : ''}
        aria-pressed={canAccess}
        disabled={busy}
        onClick={() => onChange({ delinquentCanAccess: !canAccess })}
      >
        <b>Inadimplente acessa</b>
        <small>
          Entra no portal e vê o aviso de que não participará do sorteio por
          estar inadimplente.
        </small>
      </button>
      <button
        type="button"
        className={canParticipate ? 'is-on' : ''}
        aria-pressed={canParticipate}
        disabled={busy}
        onClick={() => onChange({ delinquentCanParticipate: !canParticipate })}
      >
        <b>Permite participar do sorteio</b>
        <small>Entra na fila e pode ser chamado, como os demais contratos.</small>
      </button>
    </div>
  )
}
