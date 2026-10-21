import { useEffect, useState } from 'react'
import { Plus, Search, Trash2 } from 'lucide-react'
import { api, type CallContact, type CallPhone } from '../api/client'
import { formatWhatsappPhone, phoneFieldValue } from '../config/collectionNotice'
import type { BuildingKind } from '../config/building'
import { TwilioCallButton } from './TwilioCallButton'

const AGENT_PHONE_KEY = 'evo-coop-agent-phone-id'

type Props = {
  building: BuildingKind
  group: string
}

export function CobrancaCalls({ building, group }: Props) {
  const [teamPhones, setTeamPhones] = useState<CallPhone[]>([])
  const [agentId, setAgentId] = useState(
    () => window.localStorage.getItem(AGENT_PHONE_KEY) ?? '',
  )
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [search, setSearch] = useState('')
  const [contacts, setContacts] = useState<CallContact[]>([])
  const [phones, setPhones] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [voiceHint, setVoiceHint] = useState('')

  useEffect(() => {
    void api
      .cobrancaCallPhones()
      .then(setTeamPhones)
      .catch(() => undefined)
    void api
      .cobrancaVoiceStatus()
      .then(({ configured: ready, hint }) => {
        setConfigured(ready)
        setVoiceHint(hint)
      })
      .catch(() => setConfigured(false))
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const timer = window.setTimeout(() => {
      void api
        .cobrancaCallContacts(building, group, search.trim())
        .then((rows) => {
          if (cancelled) return
          setContacts(rows)
          setPhones((current) => {
            const next = { ...current }
            for (const row of rows) {
              if (next[row.associateCode] === undefined) {
                next[row.associateCode] = row.phone
                  ? formatWhatsappPhone(row.phone)
                  : ''
              }
            }
            return next
          })
        })
        .catch((loadError: unknown) => {
          if (!cancelled) {
            setError(
              loadError instanceof Error
                ? loadError.message
                : 'Não foi possível carregar os associados.',
            )
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }, 250)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [building, group, search])

  const activeAgent =
    teamPhones.find((item) => item.id === agentId) ?? teamPhones[0] ?? null

  const run = async (task: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try {
      await task()
    } catch (taskError) {
      setError(
        taskError instanceof Error
          ? taskError.message
          : 'Não foi possível concluir a ação.',
      )
    } finally {
      setBusy(false)
    }
  }

  const chooseAgent = (id: string) => {
    setAgentId(id)
    window.localStorage.setItem(AGENT_PHONE_KEY, id)
  }

  const withPhone = contacts.filter((contact) => contact.phone).length

  return (
    <div className="cobranca-calls">
      <section
        className={
          teamPhones.length === 0
            ? 'cobranca-calls-team is-empty'
            : 'cobranca-calls-team'
        }
      >
        <header>
          <h2>Celulares da equipe</h2>
          <p>
            A ligação sai pelo headset deste computador. A Twilio chama o celular
            salvo no contrato de 6 dígitos.
          </p>
        </header>
        <ul>
          {teamPhones.length === 0 && (
            <li className="cobranca-empty">Nenhum celular cadastrado.</li>
          )}
          {teamPhones.map((item) => (
            <li key={item.id}>
              <label>
                <input
                  type="radio"
                  name="call-agent"
                  checked={activeAgent?.id === item.id}
                  onChange={() => chooseAgent(item.id)}
                />
                <span>
                  <strong>{item.name}</strong>
                  <small>{formatWhatsappPhone(item.phone)}</small>
                </span>
              </label>
              <button
                type="button"
                className="cobranca-icon"
                aria-label={`Remover ${item.name}`}
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await api.removeCobrancaCallPhone(item.id)
                    setTeamPhones((current) =>
                      current.filter((phoneItem) => phoneItem.id !== item.id),
                    )
                  })
                }
              >
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
        {teamPhones.length < 2 && (
          <form
            className="cobranca-calls-add"
            onSubmit={(event) => {
              event.preventDefault()
              void run(async () => {
                const created = await api.addCobrancaCallPhone(name, phone)
                setTeamPhones((current) => [...current, created])
                chooseAgent(created.id)
                setName('')
                setPhone('')
              })
            }}
          >
            <input
              value={name}
              maxLength={120}
              placeholder="Quem atende"
              onChange={(event) => setName(event.target.value)}
            />
            <input
              inputMode="tel"
              autoComplete="tel"
              placeholder="(11) 90000-0000"
              value={phone}
              onChange={(event) => {
                const element = event.target
                const next = phoneFieldValue(element.value, element.selectionStart)
                setPhone(next.value)
                window.requestAnimationFrame(() => {
                  element.setSelectionRange(next.caret, next.caret)
                })
              }}
            />
            <button
              type="submit"
              disabled={busy || name.trim().length < 2 || phone.trim().length < 8}
            >
              <Plus size={16} /> Cadastrar
            </button>
          </form>
        )}
      </section>

      {configured === false && (
        <p className="login-error">
          {voiceHint || 'A Twilio ainda não está configurada.'}
        </p>
      )}
      {error && <p className="login-error">{error}</p>}

      <section className="cobranca-calls-list">
        <header>
          <label className="cobranca-calls-search">
            <Search size={15} />
            <input
              type="search"
              placeholder="Buscar por contrato, nome ou telefone"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <small>
            {loading
              ? 'Carregando…'
              : `${contacts.length} associados · ${withPhone} com telefone`}
          </small>
        </header>
        <ul>
          {!loading && contacts.length === 0 && (
            <li className="cobranca-empty">
              Nenhum associado encontrado neste evento.
            </li>
          )}
          {contacts.map((contact) => {
            const draft = phones[contact.associateCode] ?? ''
            return (
              <li key={contact.associateCode}>
                <div>
                  <strong>Contrato {contact.associateCode}</strong>
                  <small>{contact.participant || 'Sem nome'}</small>
                </div>
                <form
                  onSubmit={(event) => {
                    event.preventDefault()
                    void run(async () => {
                      const saved = await api.saveCobrancaContractPhone(
                        building,
                        contact.associateCode,
                        draft,
                      )
                      const formatted = saved.phone
                        ? formatWhatsappPhone(saved.phone)
                        : ''
                      setPhones((current) => ({
                        ...current,
                        [contact.associateCode]: formatted,
                      }))
                      setContacts((current) =>
                        current.map((item) =>
                          item.associateCode === contact.associateCode
                            ? { ...item, phone: saved.phone }
                            : item,
                        ),
                      )
                    })
                  }}
                >
                  <input
                    inputMode="tel"
                    autoComplete="tel"
                    aria-label={`Celular do contrato ${contact.associateCode}`}
                    placeholder="Celular do contrato"
                    value={draft}
                    onChange={(event) => {
                      const element = event.target
                      const next = phoneFieldValue(
                        element.value,
                        element.selectionStart,
                      )
                      setPhones((current) => ({
                        ...current,
                        [contact.associateCode]: next.value,
                      }))
                      window.requestAnimationFrame(() => {
                        element.setSelectionRange(next.caret, next.caret)
                      })
                    }}
                  />
                  <button type="submit" disabled={busy}>
                    Salvar
                  </button>
                </form>
                <TwilioCallButton
                  phone={contact.phone || null}
                  configured={configured}
                  hint={voiceHint}
                />
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
