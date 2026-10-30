import { useEffect, useState } from 'react'
import { Download, Plus, Search, Trash2 } from 'lucide-react'
import {
  api,
  type CallContact,
  type CallPhone,
  type CallRecording,
  type PortalCallRequest,
  type VoiceLine,
  type VoiceStaff,
} from '../api/client'
import { formatWhatsappPhone, phoneFieldValue } from '../config/collectionNotice'
import type { BuildingKind } from '../config/building'
import {
  CallAudioSetup,
  loadCallAudioRouting,
  type CallAudioRouting,
} from './CallAudioSetup'
import { TwilioCallButton } from './TwilioCallButton'

const AGENT_PHONE_KEY = 'evo-coop-agent-phone-id'

function formatCpf(documentNumber: string, documentTail: string) {
  const digits = documentNumber.replace(/\D/g, '')
  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  }
  if (/^\d{5}$/.test(documentTail)) return `finais ${documentTail}`
  return 'Não cadastrado'
}

function formatBirth(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return 'Não cadastrado'
  return `${match[3]}/${match[2]}/${match[1]}`
}

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
  const [callRequests, setCallRequests] = useState<PortalCallRequest[]>([])
  const [phones, setPhones] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [voiceHint, setVoiceHint] = useState('')
  const [recordCalls, setRecordCalls] = useState(true)
  const [recordings, setRecordings] = useState<CallRecording[]>([])
  const [audioRouting, setAudioRouting] = useState<CallAudioRouting>(
    loadCallAudioRouting,
  )
  const [activeContract, setActiveContract] = useState('')
  const [voiceLines, setVoiceLines] = useState<VoiceLine[]>([])
  const [voiceStaff, setVoiceStaff] = useState<VoiceStaff[]>([])

  useEffect(() => {
    void api
      .cobrancaCallPhones()
      .then(setTeamPhones)
      .catch(() => undefined)
    void api
      .cobrancaVoiceStatus()
      .then(({ configured: ready, hint, recordCalls: enabled }) => {
        setConfigured(ready)
        setVoiceHint(hint)
        setRecordCalls(enabled)
      })
      .catch(() => setConfigured(false))
    let cancelled = false
    const loadLines = () => {
      void api
        .cobrancaVoiceLines()
        .then((payload) => {
          if (cancelled) return
          setVoiceLines(payload.lines)
          setVoiceStaff(payload.staff)
        })
        .catch(() => undefined)
    }
    loadLines()
    const timer = window.setInterval(loadLines, 5_000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const timer = window.setTimeout(() => {
      void api
        .cobrancaCallRequests(building, group)
        .then((rows) => {
          if (!cancelled) setCallRequests(rows)
        })
        .catch(() => {
          if (!cancelled) setCallRequests([])
        })
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

  const reloadRecordings = () => {
    const codes = contacts.map((contact) => contact.associateCode)
    if (codes.length === 0) {
      setRecordings([])
      return
    }
    void api
      .cobrancaCallRecordings(building, codes)
      .then(async (items) => {
        setRecordings(items)
        const cutoff = Date.now() - 2 * 60 * 60 * 1000
        const pending = items
          .filter(
            (item) => !item.recordingSid && Date.parse(item.createdAt) > cutoff,
          )
          .slice(0, 3)
        for (const item of pending) {
          try {
            const saved = await api.syncCallRecording(item.callSid)
            if (!saved.recordingSid) continue
            setRecordings((current) =>
              current.map((row) => (row.id === saved.id ? saved : row)),
            )
          } catch {
            return
          }
        }
      })
      .catch(() => undefined)
  }

  useEffect(() => {
    reloadRecordings()
  }, [building, contacts])

  const activeAgent =
    teamPhones.find((item) => item.id === agentId) ?? teamPhones[0] ?? null

  const downloadAllRecordings = () => {
    const codes = contacts.map((contact) => contact.associateCode)
    if (codes.length === 0) return
    const link = document.createElement('a')
    link.href = `/api/cobranca/voice/recordings-download?building=${encodeURIComponent(
      building,
    )}&codes=${encodeURIComponent(codes.join(','))}`
    link.download = ''
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

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
      <div className="cobranca-calls-setup">
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
      <CallAudioSetup
        value={audioRouting}
        onChange={setAudioRouting}
        disabled={Boolean(activeContract)}
      />
      <label className="cobranca-record-toggle">
        <input
          type="checkbox"
          checked={recordCalls}
          onChange={(event) => {
            const enabled = event.target.checked
            setRecordCalls(enabled)
            void api.saveCallRecordingSetting(enabled).catch(() => {
              setRecordCalls(!enabled)
            })
          }}
        />
        <span>
          Gravar todas as ligações. Cada áudio fica neste contrato. O associado
          ouve, no início, que a chamada será gravada.
        </span>
      </label>
      {error && <p className="login-error">{error}</p>}

      <section className="cobranca-voice-lines">
        <header>
          <h2>Números da Twilio</h2>
          <p>
            Cada número pode ficar com um usuário ou livre para quem não está
            em ligação. A conferência começa privada. Com Conferido, a
            atendente coloca o associado no ar.
          </p>
        </header>
        <ul>
          {voiceLines.map((line) => (
            <li key={line.phone}>
              <strong>{formatWhatsappPhone(line.phone)}</strong>
              <select
                aria-label={`Quem usa o número ${formatWhatsappPhone(line.phone)}`}
                value={line.assignedUserId ?? ''}
                disabled={busy || line.inUse}
                onChange={(event) => {
                  const userId = event.target.value || null
                  void run(async () => {
                    await api.assignVoiceLine(line.phone, userId)
                    const username =
                      voiceStaff.find((person) => person.id === userId)
                        ?.username ?? ''
                    setVoiceLines((current) =>
                      current.map((item) =>
                        item.phone === line.phone
                          ? {
                              ...item,
                              assignedUserId: userId,
                              assignedUsername: username,
                            }
                          : item,
                      ),
                    )
                  })
                }}
              >
                <option value="">Quem estiver livre</option>
                {voiceStaff.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.username}
                  </option>
                ))}
              </select>
              <small>
                {line.inUse
                  ? `Em ligação${line.claimedUsername ? ` · ${line.claimedUsername}` : ''}`
                  : 'Livre'}
              </small>
            </li>
          ))}
        </ul>
      </section>
      </div>

      <div className="cobranca-calls-board">
      {callRequests.length > 0 && (
        <section className="cobranca-calls-list is-requests">
          <header>
            <h2>Números novos do portal</h2>
            <small>
              O associado informou outro celular. O número do cadastro não muda.
            </small>
          </header>
          <ul>
            {callRequests.map((request) => (
              <li key={request.associateCode}>
                <div>
                  <strong>Contrato {request.associateCode}</strong>
                  <small>
                    {request.participant || 'Sem nome'} ·{' '}
                    {formatWhatsappPhone(request.phone)}
                  </small>
                </div>
                <TwilioCallButton
                  phone={request.phone}
                  associateCode={request.associateCode}
                  building={building}
                  recordCalls={recordCalls}
                  configured={configured}
                  hint={voiceHint}
                  onRecorded={reloadRecordings}
                  audioRouting={audioRouting}
                  locked={
                    Boolean(activeContract) &&
                    activeContract !== request.associateCode
                  }
                  onActiveChange={(active) =>
                    setActiveContract((current) =>
                      active
                        ? request.associateCode
                        : current === request.associateCode
                          ? ''
                          : current,
                    )
                  }
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await api.dismissCobrancaCallRequest(
                        building,
                        request.associateCode,
                      )
                      setCallRequests((current) =>
                        current.filter(
                          (item) => item.associateCode !== request.associateCode,
                        ),
                      )
                    })
                  }
                >
                  Tirar da lista
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
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
          <div className="cobranca-calls-actions">
            <small>
              {loading
                ? 'Carregando…'
                : `${contacts.length} associados · ${withPhone} com telefone`}
            </small>
            <button
              type="button"
              onClick={downloadAllRecordings}
              disabled={loading || recordings.every((item) => !item.recordingSid)}
              title="Baixar as gravações prontas dos contratos exibidos"
            >
              <Download size={15} /> Baixar gravações
            </button>
          </div>
        </header>
        <ul className="is-conference">
          {!loading && contacts.length === 0 && (
            <li className="cobranca-empty">
              Nenhum associado encontrado neste evento.
            </li>
          )}
          {contacts.map((contact) => {
            const draft = phones[contact.associateCode] ?? ''
            return (
              <li
                key={contact.associateCode}
                className={contact.checked ? 'is-checked' : ''}
              >
                <div className="cobranca-identity">
                  <strong>Contrato {contact.associateCode}</strong>
                  <dl>
                    <dt>Nome</dt>
                    <dd>{contact.participant || 'Não cadastrado'}</dd>
                    <dt>CPF</dt>
                    <dd>
                      {formatCpf(contact.documentNumber, contact.documentTail)}
                    </dd>
                    <dt>Nascimento</dt>
                    <dd>{formatBirth(contact.birthDate)}</dd>
                  </dl>
                  <label className="cobranca-checked">
                    <input
                      type="checkbox"
                      checked={contact.checked}
                      onChange={(event) => {
                        const checked = event.target.checked
                        setContacts((current) =>
                          current.map((item) =>
                            item.associateCode === contact.associateCode
                              ? { ...item, checked }
                              : item,
                          ),
                        )
                        void api
                          .saveConference(building, contact.associateCode, checked)
                          .catch(() => {
                            setContacts((current) =>
                              current.map((item) =>
                                item.associateCode === contact.associateCode
                                  ? { ...item, checked: !checked }
                                  : item,
                              ),
                            )
                            setError('Não foi possível salvar a conferência.')
                          })
                      }}
                    />
                    Conferido
                  </label>
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
                  associateCode={contact.associateCode}
                  building={building}
                  recordCalls={recordCalls}
                  configured={configured}
                  hint={voiceHint}
                  onRecorded={reloadRecordings}
                  audioRouting={audioRouting}
                  canGoLive={contact.checked}
                  locked={
                    Boolean(activeContract) &&
                    activeContract !== contact.associateCode
                  }
                  onActiveChange={(active) =>
                    setActiveContract((current) =>
                      active
                        ? contact.associateCode
                        : current === contact.associateCode
                          ? ''
                          : current,
                    )
                  }
                />
                <div className="cobranca-recordings">
                  {recordings
                    .filter((item) => item.associateCode === contact.associateCode)
                    .slice(0, 3)
                    .map((item) =>
                      item.recordingSid ? (
                        <audio
                          key={item.id}
                          controls
                          preload="none"
                          src={`/api/cobranca/voice/recordings/${item.id}/media`}
                        />
                      ) : (
                        <small key={item.id}>Gravação em processamento.</small>
                      ),
                    )}
                </div>
              </li>
            )
          })}
        </ul>
      </section>
      </div>
    </div>
  )
}
