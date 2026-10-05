import { useEffect, useRef, useState } from 'react'
import { MessageSquarePlus, Search, SendHorizontal } from 'lucide-react'
import {
  api,
  type CobrancaConversation,
  type CobrancaMessage,
} from '../api/client'
import {
  formatWhatsappPhone,
  phoneFieldValue,
} from '../config/collectionNotice'

type Props = {
  lineId: string
  lineName: string
  connected: boolean
}

const KIND_LABEL: Record<string, string> = {
  image: '[imagem]',
  video: '[vídeo]',
  audio: '[áudio]',
  document: '[documento]',
  sticker: '[figurinha]',
  location: '[localização]',
  contact: '[contato]',
  poll: '[enquete]',
  other: '[mensagem]',
}

function conversationTitle(conversation: CobrancaConversation) {
  if (conversation.contactName) return conversation.contactName
  if (conversation.phone) return formatWhatsappPhone(conversation.phone)
  return 'Contato sem número'
}

function formatWhen(iso: string) {
  const date = new Date(iso)
  const today = new Date()
  const sameDay = date.toDateString() === today.toDateString()
  return sameDay
    ? date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
}

function messageText(message: CobrancaMessage) {
  const body = message.body.trim()
  if (message.kind === 'text') return body
  const label = KIND_LABEL[message.kind] ?? KIND_LABEL.other
  return body ? `${label} ${body}` : label
}

export function CobrancaConversations({ lineId, lineName, connected }: Props) {
  const [search, setSearch] = useState('')
  const [conversations, setConversations] = useState<CobrancaConversation[]>(
    [],
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<CobrancaMessage[]>([])
  const [draft, setDraft] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [composing, setComposing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [historyNote, setHistoryNote] = useState('')
  const threadRef = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)
  const loadingOlder = useRef(false)

  useEffect(() => {
    let cancelled = false
    const load = () => {
      void api
        .cobrancaConversations(lineId, search)
        .then((rows) => {
          if (!cancelled) setConversations(rows)
        })
        .catch(() => undefined)
    }
    load()
    const timer = window.setInterval(load, 4000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [lineId, search])

  useEffect(() => {
    if (!selectedId) return
    let cancelled = false
    const load = () => {
      void api
        .cobrancaMessages(selectedId)
        .then((rows) => {
          if (!cancelled) setMessages(rows)
        })
        .catch(() => undefined)
    }
    load()
    const timer = window.setInterval(load, 3000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [selectedId])

  useEffect(() => {
    const thread = threadRef.current
    if (thread && stickToBottom.current) thread.scrollTop = thread.scrollHeight
  }, [messages])

  const loadOlder = async (conversationId: string) => {
    if (loadingOlder.current) return
    loadingOlder.current = true
    setHistoryNote('Buscando mensagens anteriores no celular…')
    const thread = threadRef.current
    const previousHeight = thread?.scrollHeight ?? 0
    const previousTop = thread?.scrollTop ?? 0
    try {
      await api.cobrancaHistory(conversationId)
      await new Promise((resolve) => window.setTimeout(resolve, 1200))
      const rows = await api.cobrancaMessages(conversationId)
      stickToBottom.current = false
      setMessages(rows)
      window.requestAnimationFrame(() => {
        const next = threadRef.current
        if (next) next.scrollTop = next.scrollHeight - previousHeight + previousTop
      })
      setHistoryNote('')
    } catch (historyError) {
      setHistoryNote(
        historyError instanceof Error
          ? historyError.message
          : 'Não foi possível buscar as mensagens anteriores.',
      )
    } finally {
      loadingOlder.current = false
    }
  }

  useEffect(() => {
    if (!selectedId || !connected) return
    const timer = window.setTimeout(() => void loadOlder(selectedId), 0)
    return () => window.clearTimeout(timer)
  }, [selectedId, connected])

  const selected =
    conversations.find((conversation) => conversation.id === selectedId) ?? null

  const send = async () => {
    const text = draft.trim()
    if (!text) return
    setBusy(true)
    setError('')
    try {
      if (composing) {
        const created = await api.startCobrancaConversation(
          lineId,
          newPhone,
          text,
        )
        setComposing(false)
        setNewPhone('')
        setSelectedId(created.id)
      } else if (selectedId) {
        await api.sendCobrancaMessage(selectedId, text)
        setMessages(await api.cobrancaMessages(selectedId))
      }
      setDraft('')
    } catch (sendError) {
      setError(
        sendError instanceof Error
          ? sendError.message
          : 'Não foi possível enviar a mensagem.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="cobranca-chat">
      <aside className="cobranca-chat-list">
        <div className="cobranca-chat-search">
          <Search size={15} />
          <input
            placeholder="Buscar conversa"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <button
            type="button"
            className="cobranca-icon"
            aria-label="Nova conversa"
            title="Nova conversa"
            onClick={() => {
              setComposing(true)
              setSelectedId(null)
              setMessages([])
            }}
          >
            <MessageSquarePlus size={17} />
          </button>
        </div>
        <ul>
          {conversations.length === 0 && (
            <li className="cobranca-empty">
              {connected
                ? 'Nenhuma conversa ainda. As mensagens aparecem aqui assim que chegarem no celular.'
                : 'Conecte o celular para receber as conversas.'}
            </li>
          )}
          {conversations.map((conversation) => (
            <li key={conversation.id}>
              <button
                type="button"
                className={
                  conversation.id === selectedId && !composing
                    ? 'is-selected'
                    : ''
                }
                onClick={() => {
                  setComposing(false)
                  setSelectedId(conversation.id)
                }}
              >
                <span className="cobranca-chat-head">
                  <strong>{conversationTitle(conversation)}</strong>
                  <time>{formatWhen(conversation.lastMessageAt)}</time>
                </span>
                <span className="cobranca-chat-preview">
                  <small>{conversation.lastPreview || '…'}</small>
                  {conversation.unreadCount > 0 && (
                    <b>{conversation.unreadCount}</b>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="cobranca-chat-thread">
        {composing ? (
          <>
            <header>
              <h3>Nova conversa</h3>
              <p>Enviando pelo celular de {lineName}.</p>
            </header>
            <label className="cobranca-chat-new">
              WhatsApp
              <input
                inputMode="tel"
                autoComplete="tel"
                placeholder="(11) 90000-0000 ou +"
                value={newPhone}
                onChange={(event) => {
                  const element = event.target
                  const next = phoneFieldValue(
                    element.value,
                    element.selectionStart,
                  )
                  setNewPhone(next.value)
                  window.requestAnimationFrame(() => {
                    element.setSelectionRange(next.caret, next.caret)
                  })
                }}
              />
            </label>
            <div className="cobranca-chat-messages" ref={threadRef} />
          </>
        ) : selected ? (
          <>
            <header>
              <h3>{conversationTitle(selected)}</h3>
              <p>
                {selected.phone
                  ? formatWhatsappPhone(selected.phone)
                  : 'Número não identificado'}
              </p>
            </header>
            <div
              className="cobranca-chat-messages"
              ref={threadRef}
              onScroll={(event) => {
                const element = event.currentTarget
                stickToBottom.current =
                  element.scrollHeight - element.scrollTop - element.clientHeight < 80
                if (element.scrollTop < 48 && selectedId && connected) {
                  void loadOlder(selectedId)
                }
              }}
            >
              <button
                type="button"
                className="cobranca-history"
                disabled={!connected || Boolean(historyNote)}
                onClick={() => selectedId && void loadOlder(selectedId)}
              >
                {historyNote || 'Carregar mensagens anteriores'}
              </button>
              {messages.map((message) => (
                <article
                  key={message.id}
                  className={message.fromMe ? 'is-mine' : ''}
                >
                  <p>{messageText(message)}</p>
                  <time>{formatWhen(message.sentAt)}</time>
                </article>
              ))}
            </div>
          </>
        ) : (
          <div className="cobranca-chat-placeholder">
            Selecione uma conversa ou inicie uma nova.
          </div>
        )}

        {(selected || composing) && (
          <form
            className="cobranca-chat-composer"
            onSubmit={(event) => {
              event.preventDefault()
              void send()
            }}
          >
            {error && <p className="login-error">{error}</p>}
            <div>
              <textarea
                rows={2}
                placeholder={
                  connected
                    ? 'Digite uma mensagem'
                    : 'Celular reconectando… o envio volta sozinho'
                }
                value={draft}
                disabled={!connected || busy}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    void send()
                  }
                }}
              />
              <button
                type="submit"
                className="is-primary"
                aria-label="Enviar"
                disabled={!connected || busy || !draft.trim()}
              >
                <SendHorizontal size={17} />
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  )
}
