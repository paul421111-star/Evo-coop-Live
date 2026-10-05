import { access, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Boom } from '@hapi/boom'
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState as loadAuthState,
  type WASocket,
} from '@whiskeysockets/baileys'
import QRCode from 'qrcode'
import pino from 'pino'
import { ingestMessages, recordOutgoing, rememberContacts } from './inbox'

export type LineState =
  | 'disconnected'
  | 'connecting'
  | 'pairing'
  | 'connected'
  | 'reconnecting'
  | 'logged_out'

type Runtime = {
  state: LineState
  qr: string | null
  phone: string | null
  error: string | null
  socket?: WASocket
  stopping: boolean
  opening: boolean
  reconnects: number
  reconnectTimer?: ReturnType<typeof setTimeout>
}

const logger = pino({ level: 'silent' })
const authRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'data',
  'whatsapp',
)
const runtimes = new Map<string, Runtime>()

function runtimeFor(lineId: string) {
  const current = runtimes.get(lineId)
  if (current) return current
  const created: Runtime = {
    state: 'disconnected',
    qr: null,
    phone: null,
    error: null,
    stopping: false,
    opening: false,
    reconnects: 0,
  }
  runtimes.set(lineId, created)
  return created
}

function disconnectCode(error: unknown) {
  if (error instanceof Boom) return error.output.statusCode
  if (error && typeof error === 'object' && 'output' in error) {
    const status = (error as Boom).output?.statusCode
    return typeof status === 'number' ? status : undefined
  }
  return undefined
}

function phoneFromJid(jid: string | undefined) {
  if (!jid || jid.endsWith('@lid')) return null
  const digits = jid.split('@')[0]?.split(':')[0]?.replace(/\D/g, '') ?? ''
  if (digits.length < 12 || digits.length > 13) return null
  return digits
}

export function lineSnapshot(lineId: string) {
  const runtime = runtimes.get(lineId)
  return {
    state: runtime?.state ?? 'disconnected',
    connected: runtime?.state === 'connected',
    qr: runtime?.qr ?? null,
    phone: runtime?.phone ?? null,
    error: runtime?.error ?? null,
  }
}

export function connectedLineIds() {
  return [...runtimes.entries()]
    .filter(([, runtime]) => runtime.state === 'connected')
    .map(([lineId]) => lineId)
}

export async function startLine(lineId: string) {
  const runtime = runtimeFor(lineId)
  if (
    runtime.socket &&
    (runtime.state === 'connected' ||
      runtime.state === 'pairing' ||
      runtime.state === 'connecting')
  ) {
    return lineSnapshot(lineId)
  }
  clearTimeout(runtime.reconnectTimer)
  if (runtime.opening || runtime.socket) return lineSnapshot(lineId)
  runtime.opening = true
  runtime.stopping = false
  runtime.error = null
  runtime.state = 'connecting'
  try {
    const { state, saveCreds } = await loadAuthState(
      path.join(authRoot, lineId),
    )
    const { version } = await fetchLatestBaileysVersion()
    const socket = makeWASocket({
      version,
      auth: state,
      logger,
      printQRInTerminal: false,
      browser: Browsers.macOS('Evo Coop Live'),
      markOnlineOnConnect: false,
    })
    runtime.socket = socket
    runtime.opening = false
    socket.ev.on('creds.update', saveCreds)
    socket.ev.on('messages.upsert', ({ messages, type }) => {
      void ingestMessages(socket, lineId, messages, {
        countUnread: type === 'notify',
      }).catch((error: unknown) => {
        console.error('[cobranca] falha ao gravar mensagem', error)
      })
    })
    socket.ev.on('messaging-history.set', ({ messages, contacts }) => {
      void (async () => {
        await ingestMessages(socket, lineId, messages, { countUnread: false })
        await rememberContacts(lineId, contacts)
      })().catch((error: unknown) => {
        console.error('[cobranca] falha ao importar histórico', error)
      })
    })
    socket.ev.on('contacts.upsert', (contacts) => {
      void rememberContacts(lineId, contacts).catch(() => undefined)
    })
    socket.ev.on('contacts.update', (contacts) => {
      void rememberContacts(lineId, contacts).catch(() => undefined)
    })
    socket.ev.on('connection.update', (update) => {
      void (async () => {
        if (runtime.socket !== socket) return
        if (update.qr) {
          runtime.qr = await QRCode.toDataURL(update.qr, { margin: 1, width: 280 })
          runtime.state = 'pairing'
          runtime.error = null
        }
        if (update.connection === 'open') {
          runtime.state = 'connected'
          runtime.reconnects = 0
          runtime.qr = null
          runtime.error = null
          runtime.phone = phoneFromJid(socket.user?.id)
        }
        if (update.connection !== 'close') return
        const code = disconnectCode(update.lastDisconnect?.error)
        if (runtime.socket !== socket) return
        runtime.socket = undefined
        runtime.qr = null
        console.error(`[cobranca] ${lineId} desconectou (${code ?? 'sem código'})`)
        if (runtime.stopping) {
          runtime.state = 'disconnected'
          return
        }
        if (code === DisconnectReason.loggedOut) {
          runtime.state = 'logged_out'
          runtime.phone = null
          runtime.error = 'O celular desvinculou esta sessão. Gere um novo QR.'
          return
        }
        if (code === DisconnectReason.connectionReplaced) {
          runtime.state = 'disconnected'
          runtime.error =
            'Este celular foi conectado em outro lugar. Toque em Conectar.'
          return
        }
        runtime.state = 'reconnecting'
        runtime.reconnects += 1
        const wait = Math.min(30_000, 2_000 * runtime.reconnects)
        clearTimeout(runtime.reconnectTimer)
        runtime.reconnectTimer = setTimeout(() => {
          void startLine(lineId).catch((error: unknown) => {
            runtime.state = 'disconnected'
            runtime.error =
              error instanceof Error
                ? error.message
                : 'Não foi possível reconectar o WhatsApp.'
          })
        }, wait)
      })()
    })
  } catch (error) {
    runtime.opening = false
    runtime.state = 'disconnected'
    runtime.socket = undefined
    runtime.error =
      error instanceof Error
        ? error.message
        : 'Não foi possível iniciar a conexão.'
  }
  return lineSnapshot(lineId)
}

/** Religa os celulares já pareados. Só pode haver um processo da API, senão o WhatsApp derruba a sessão. */
export async function resumeLines(lineIds: string[]) {
  for (const lineId of lineIds) {
    try {
      await access(path.join(authRoot, lineId, 'creds.json'))
    } catch {
      continue
    }
    void startLine(lineId).catch((error: unknown) => {
      console.error(`[cobranca] falha ao religar ${lineId}`, error)
    })
  }
}

export async function stopLine(lineId: string) {
  const runtime = runtimeFor(lineId)
  runtime.stopping = true
  runtime.reconnects = 0
  clearTimeout(runtime.reconnectTimer)
  runtime.qr = null
  runtime.socket?.end(undefined)
  runtime.socket = undefined
  runtime.state = 'disconnected'
  return lineSnapshot(lineId)
}

export async function restartLine(lineId: string) {
  await stopLine(lineId)
  await rm(path.join(authRoot, lineId), { recursive: true, force: true })
  const runtime = runtimeFor(lineId)
  runtime.phone = null
  runtime.stopping = false
  return startLine(lineId)
}

export async function unlinkLine(lineId: string) {
  const runtime = runtimes.get(lineId)
  try {
    await runtime?.socket?.logout()
  } catch {
    runtime?.socket?.end(undefined)
  }
  if (runtime) {
    runtime.stopping = true
    runtime.socket = undefined
    runtime.qr = null
    runtime.phone = null
    runtime.state = 'disconnected'
    runtime.error = null
  }
  await rm(path.join(authRoot, lineId), { recursive: true, force: true })
  return lineSnapshot(lineId)
}

export async function fetchOlderHistory(
  lineId: string,
  jid: string,
  waId: string,
  fromMe: boolean,
  sentAt: Date,
) {
  const runtime = runtimes.get(lineId)
  if (!runtime?.socket || runtime.state !== 'connected') {
    throw new Error('O celular precisa estar conectado para buscar o histórico.')
  }
  await runtime.socket.fetchMessageHistory(
    50,
    { remoteJid: jid, id: waId, fromMe },
    Math.floor(sentAt.getTime() / 1000),
  )
}

export async function sendText(lineId: string, phone: string, text: string) {
  return sendToJid(lineId, `${phone}@s.whatsapp.net`, phone, text)
}

export async function sendToJid(
  lineId: string,
  jid: string,
  phone: string | null,
  text: string,
) {
  const runtime = runtimes.get(lineId)
  if (!runtime?.socket || runtime.state !== 'connected') {
    throw new Error('Nenhum celular da cobrança está conectado.')
  }
  const sent = await runtime.socket.sendMessage(jid, { text })
  return recordOutgoing({
    lineId,
    jid,
    phone,
    text,
    waId: sent?.key?.id ?? null,
  })
}
