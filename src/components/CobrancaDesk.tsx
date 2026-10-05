import { useEffect, useState } from 'react'
import {
  CheckCircle2,
  MessagesSquare,
  Plus,
  QrCode,
  RefreshCw,
  Smartphone,
  Trash2,
  Unplug,
} from 'lucide-react'
import {
  api,
  type CobrancaAgent,
  type CobrancaLance,
  type CobrancaLine,
  type CobrancaLineState,
} from '../api/client'
import {
  anticipationAmount,
  formatWhatsappPhone,
  phoneFieldValue,
  formatMoney,
} from '../config/collectionNotice'
import type { BuildingKind } from '../config/building'
import { CobrancaConversations } from './CobrancaConversations'

type Props = {
  building: BuildingKind
  group: string
}

const STATE_LABEL: Record<CobrancaLineState, string> = {
  disconnected: 'Desconectado',
  connecting: 'Conectando',
  pairing: 'Aguardando QR',
  connected: 'Conectado',
  reconnecting: 'Reconectando',
  logged_out: 'Sessão encerrada',
}

function waitingReason(
  lance: CobrancaLance,
  agent: CobrancaAgent,
  hasConnection: boolean,
) {
  if (lance.offerStatus !== 'confirmed') return 'Aguardando confirmação do lance'
  if (!lance.whatsappPhone) return 'Sem WhatsApp do associado'
  if (agent.installmentValue <= 0) return 'Informe o valor da parcela'
  if (!hasConnection) return 'Nenhum celular conectado'
  if (lance.dispatchStatus === 'failed') {
    return lance.dispatchError || 'Falha no envio. Nova tentativa em instantes.'
  }
  return 'Na fila de envio'
}

export function CobrancaDesk({ building, group }: Props) {
  const [lines, setLines] = useState<CobrancaLine[]>([])
  const [agent, setAgent] = useState<CobrancaAgent>({
    enabled: true,
    installmentValue: 0,
    lineId: null,
  })
  // Rascunho do valor digitado: a tela atualiza sozinha a cada 4 s e não pode
  // apagar o que a pessoa está escrevendo.
  const [valueDraft, setValueDraft] = useState<string | null>(null)
  const [agentNote, setAgentNote] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tab, setTab] = useState<'conversas' | 'conexao' | 'agente'>(
    'conversas',
  )
  const [name, setName] = useState('')
  const [lances, setLances] = useState<CobrancaLance[]>([])
  const [phones, setPhones] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const selected = lines.find((line) => line.id === selectedId) ?? lines[0] ?? null
  const connectedCount = lines.filter((line) => line.connected).length

  useEffect(() => {
    let cancelled = false
    const load = () => {
      void api
        .cobrancaDesk()
        .then((data) => {
          if (cancelled) return
          setLines(data.lines)
          setAgent(data.agent)
          setSelectedId((current) => current ?? data.lines[0]?.id ?? null)
          setError((current) =>
            current === 'Sessão necessária.' || current === 'Sessão expirada.'
              ? ''
              : current,
          )
        })
        .catch((loadError: unknown) => {
          if (!cancelled) {
            setError(
              loadError instanceof Error
                ? loadError.message
                : 'Não foi possível carregar a cobrança.',
            )
          }
        })
      void api
        .cobrancaLances(building, group)
        .then((rows) => {
          if (cancelled) return
          setLances(rows)
          setPhones((current) => {
            const next = { ...current }
            for (const row of rows) {
              if (next[row.id] === undefined) {
                next[row.id] = row.whatsappPhone
                  ? formatWhatsappPhone(row.whatsappPhone)
                  : ''
              }
            }
            return next
          })
        })
        .catch(() => undefined)
    }
    load()
    const timer = window.setInterval(load, 4000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [building, group])

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

  const saveAgent = async (next: CobrancaAgent) => {
    setAgent(next)
    try {
      const saved = await api.saveCobrancaAgent({ ...next, enabled: true })
      setAgent(saved)
      setValueDraft(null)
      setAgentNote(
        `Salvo às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
      )
    } catch (saveError) {
      setAgentNote(
        saveError instanceof Error
          ? saveError.message
          : 'Não foi possível salvar o agente.',
      )
    }
  }

  const commitValue = () => {
    if (valueDraft === null) return
    const parsed = Number(valueDraft.replace(/\./g, '').replace(',', '.'))
    if (!Number.isFinite(parsed) || parsed < 0) {
      setAgentNote('Informe um valor de parcela válido.')
      return
    }
    if (parsed === agent.installmentValue) {
      setValueDraft(null)
      return
    }
    void saveAgent({ ...agent, installmentValue: parsed })
  }

  const addLine = () =>
    run(async () => {
      const created = await api.createCobrancaLine(name)
      setName('')
      setLines((current) => [...current, created])
      setSelectedId(created.id)
      setTab('conexao')
    })

  const channel = (action: 'start' | 'stop' | 'restart' | 'unlink') => {
    if (!selected) return
    void run(async () => {
      await api.cobrancaChannel(selected.id, action)
      const data = await api.cobrancaDesk()
      setLines(data.lines)
      setAgent(data.agent)
    })
  }

  return (
    <main className="cobranca-desk">
      <header className="cobranca-heading">
        <div>
          <span className="eyebrow">Departamento de Cobrança</span>
          <h1>WhatsApp da cobrança</h1>
          <p>
            Conecte o celular de quem opera a cobrança. O agente acompanha os
            lances confirmados e envia o valor da antecipação.
          </p>
        </div>
        <strong>
          {connectedCount}/{lines.length} conectados
        </strong>
      </header>

      {error && <p className="login-error">{error}</p>}

      <div className="cobranca-layout">
        <section className="cobranca-team">
          <header>
            <h2>Equipe</h2>
            <p>Cada celular recebe o próprio QR.</p>
          </header>
          <form
            className="cobranca-add"
            onSubmit={(event) => {
              event.preventDefault()
              void addLine()
            }}
          >
            <input
              value={name}
              maxLength={120}
              placeholder="Nome de quem vai conectar"
              onChange={(event) => setName(event.target.value)}
            />
            <button type="submit" disabled={busy || name.trim().length < 2}>
              <Plus size={16} /> Adicionar
            </button>
          </form>
          <ul>
            {lines.length === 0 && (
              <li className="cobranca-empty">Nenhum celular cadastrado.</li>
            )}
            {lines.map((line) => (
              <li key={line.id}>
                <button
                  type="button"
                  className={line.id === selected?.id ? 'is-selected' : ''}
                  onClick={() => setSelectedId(line.id)}
                >
                  <span className="cobranca-sigla">{line.sigla}</span>
                  <span>
                    <strong>{line.name}</strong>
                    <small className={line.connected ? 'is-on' : ''}>
                      {STATE_LABEL[line.state]}
                      {line.phone ? ` · ${formatWhatsappPhone(line.phone)}` : ''}
                    </small>
                  </span>
                </button>
                <button
                  type="button"
                  className="cobranca-icon"
                  aria-label={`Remover ${line.name}`}
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await api.removeCobrancaLine(line.id)
                      setLines((current) =>
                        current.filter((item) => item.id !== line.id),
                      )
                      setSelectedId((current) =>
                        current === line.id ? null : current,
                      )
                    })
                  }
                >
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="cobranca-work">
          <div className="cobranca-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'conversas'}
              className={tab === 'conversas' ? 'is-active' : ''}
              onClick={() => setTab('conversas')}
            >
              <MessagesSquare size={15} /> Conversas
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'conexao'}
              className={tab === 'conexao' ? 'is-active' : ''}
              onClick={() => setTab('conexao')}
            >
              <QrCode size={15} /> Conexão
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'agente'}
              className={tab === 'agente' ? 'is-active' : ''}
              onClick={() => setTab('agente')}
            >
              <CheckCircle2 size={15} /> Agente
            </button>
          </div>

          {tab === 'conversas' ? (
            selected ? (
              <CobrancaConversations
                key={selected.id}
                lineId={selected.id}
                lineName={selected.name}
                connected={selected.connected}
              />
            ) : (
              <div className="cobranca-connection">
                <p>Adicione alguém da cobrança para ver as conversas.</p>
              </div>
            )
          ) : tab === 'conexao' ? (
            <div className="cobranca-connection">
              {!selected ? (
                <p>Adicione alguém da cobrança para gerar o QR do celular.</p>
              ) : (
                <>
                  <header>
                    <h2>{selected.name}</h2>
                    <p>
                      {selected.sigla} · este QR vale só para {selected.name}.
                    </p>
                  </header>
                  <div className={`cobranca-status is-${selected.state}`}>
                    <Smartphone size={16} />
                    {STATE_LABEL[selected.state]}
                  </div>
                  {selected.qr ? (
                    <img src={selected.qr} alt="QR Code para conectar o WhatsApp" />
                  ) : (
                    <div className="cobranca-qr-placeholder">
                      {selected.connected
                        ? 'WhatsApp conectado. Não é necessário um novo QR.'
                        : 'O QR aparece aqui depois de tocar em Conectar.'}
                    </div>
                  )}
                  {selected.error && <p className="login-error">{selected.error}</p>}
                  <p className="cobranca-help">
                    No celular, abra o WhatsApp, vá em Aparelhos conectados e
                    leia o QR.
                  </p>
                  <div className="cobranca-actions">
                    {selected.state === 'disconnected' ||
                    selected.state === 'logged_out' ? (
                      <button
                        type="button"
                        className="is-primary"
                        disabled={busy}
                        onClick={() => channel('start')}
                      >
                        <Smartphone size={15} /> Conectar
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => channel('stop')}
                      >
                        <Unplug size={15} /> Parar
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => channel('restart')}
                    >
                      <RefreshCw size={15} /> Novo QR
                    </button>
                    <button
                      type="button"
                      disabled={busy || selected.state === 'disconnected'}
                      onClick={() => channel('unlink')}
                    >
                      Desvincular
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="cobranca-agent">
              <form
                className="cobranca-agent-settings"
                onSubmit={(event) => {
                  event.preventDefault()
                  commitValue()
                }}
              >
                <label>
                  Valor da parcela (R$)
                  <input
                    inputMode="decimal"
                    placeholder="0,00"
                    value={
                      valueDraft ??
                      (agent.installmentValue > 0
                        ? agent.installmentValue.toLocaleString('pt-BR', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })
                        : '')
                    }
                    onChange={(event) => setValueDraft(event.target.value)}
                    onBlur={commitValue}
                  />
                </label>
                <label>
                  Enviar por
                  <select
                    value={agent.lineId ?? ''}
                    onChange={(event) =>
                      void saveAgent({
                        ...agent,
                        lineId: event.target.value || null,
                      })
                    }
                  >
                    <option value="">Primeiro celular conectado</option>
                    {lines.map((line) => (
                      <option key={line.id} value={line.id}>
                        {line.name}
                        {line.connected ? ' · conectado' : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="submit" className="is-primary">
                  Salvar
                </button>
                {agentNote && <small className="cobranca-agent-note">{agentNote}</small>}
              </form>
              <div
                className={`cobranca-agent-status ${
                  agent.installmentValue > 0 && connectedCount > 0
                    ? 'is-on'
                    : 'is-off'
                }`}
              >
                <CheckCircle2 size={15} />
                {agent.installmentValue > 0 && connectedCount > 0
                  ? `Agente ativo: a cada confirmação no ranking, envia parcelas × ${formatMoney(agent.installmentValue)} pelo WhatsApp.`
                  : agent.installmentValue <= 0
                    ? 'Agente aguardando: informe o valor da parcela para liberar os envios.'
                    : 'Agente aguardando: conecte um celular na aba Conexão.'}
              </div>
              <ul className="cobranca-lances">
                {lances.length === 0 && (
                  <li className="cobranca-empty">
                    Ninguém está dando lance neste evento.
                  </li>
                )}
                {lances.map((lance) => {
                  const installments =
                    lance.offerStatus === 'confirmed'
                      ? lance.anticipatedInstallments
                      : lance.offeredInstallments
                  const amount = anticipationAmount(
                    installments,
                    agent.installmentValue,
                  )
                  return (
                    <li key={lance.id}>
                      <div>
                        <strong>
                          {lance.associateCode}
                          {lance.participant ? ` · ${lance.participant}` : ''}
                        </strong>
                        <small>
                          {installments} parcela{installments === 1 ? '' : 's'}
                          {agent.installmentValue > 0
                            ? ` · ${formatMoney(amount)}`
                            : ''}
                          {' · '}
                          {lance.offerStatus === 'confirmed'
                            ? 'Confirmado'
                            : 'Lance em aberto'}
                        </small>
                      </div>
                      <form
                        onSubmit={(event) => {
                          event.preventDefault()
                          void run(async () => {
                            const saved = await api.saveCobrancaPhone(
                              lance.id,
                              phones[lance.id] ?? '',
                            )
                            setPhones((current) => ({
                              ...current,
                              [lance.id]: saved.phone
                                ? formatWhatsappPhone(saved.phone)
                                : '',
                            }))
                          })
                        }}
                      >
                        <input
                          inputMode="tel"
                          autoComplete="tel"
                          aria-label={`WhatsApp de ${lance.associateCode}`}
                          placeholder="(11) 90000-0000 ou +"
                          value={
                            phones[lance.id] ??
                            (lance.whatsappPhone
                              ? formatWhatsappPhone(lance.whatsappPhone)
                              : '')
                          }
                          onChange={(event) => {
                            const element = event.target
                            const next = phoneFieldValue(
                              element.value,
                              element.selectionStart,
                            )
                            setPhones((current) => ({
                              ...current,
                              [lance.id]: next.value,
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
                      <em
                        className={
                          lance.dispatchStatus === 'sent' ? 'is-sent' : ''
                        }
                      >
                        {lance.dispatchStatus === 'sent'
                          ? `Enviado${lance.dispatchAmount !== null ? ` ${formatMoney(lance.dispatchAmount)}` : ''}${
                              lance.sentAt
                                ? ` · ${new Date(lance.sentAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`
                                : ''
                            }`
                          : waitingReason(lance, agent, connectedCount > 0)}
                      </em>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
