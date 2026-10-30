import { useEffect, useId, useRef, useState } from 'react'
import { Users } from 'lucide-react'
import { api, type LoggedAssociate } from '../api/client'
import type { BuildingKind } from '../config/building'

const clock = new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit',
  minute: '2-digit',
})

export function LoggedAssociates({
  building,
  drawGroup,
}: {
  building: BuildingKind
  drawGroup: string
}) {
  const [rows, setRows] = useState<LoggedAssociate[]>([])
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const panelId = useId()

  useEffect(() => {
    let cancelled = false
    const load = () => {
      if (document.hidden) return
      api
        .loggedAssociates(building, drawGroup)
        .then((next) => {
          if (cancelled) return
          setRows(next)
          setError('')
        })
        .catch(() => {
          if (!cancelled) setError('Não foi possível carregar quem está logado.')
        })
    }
    load()
    const timer = window.setInterval(load, 5_000)
    document.addEventListener('visibilitychange', load)
    return () => {
      cancelled = true
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', load)
    }
  }, [building, drawGroup])

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="logged-associates" ref={root}>
      <button
        type="button"
        className={open ? 'is-open' : ''}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
      >
        <Users size={15} />
        Logados
        <b>{rows.length}</b>
      </button>
      {open && (
        <div className="logged-associates-panel" id={panelId}>
          <h2>Associados logados</h2>
          {error && <p>{error}</p>}
          {!error && rows.length === 0 && (
            <p>Nenhum associado logado neste evento.</p>
          )}
          {rows.length > 0 && (
            <ol>
              {rows.map((row) => (
                <li key={row.associateCode}>
                  <strong>{row.associateCode}</strong>
                  {row.participant && <span>{row.participant}</span>}
                  <small>Entrou às {clock.format(new Date(row.since))}</small>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  )
}
