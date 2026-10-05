import { randomUUID } from 'node:crypto'
import type { WAMessage, WASocket } from '@whiskeysockets/baileys'
import {
  getContentType,
  isJidGroup,
  isLidUser,
  jidNormalizedUser,
  normalizeMessageContent,
} from '@whiskeysockets/baileys'
import type { PoolClient } from 'pg'
import { pool } from '../db'

type Db = Pick<PoolClient, 'query'>

// Os lotes de histórico chegam em paralelo; processamos um por vez, numa
// única conexão, para não travar a API durante a importação.
let queue: Promise<void> = Promise.resolve()

function enqueue(task: (db: Db) => Promise<void>) {
  const run = queue.then(async () => {
    const client = await pool.connect()
    try {
      await task(client)
    } finally {
      client.release()
    }
  })
  queue = run.catch(() => undefined)
  return run
}

type Stored = {
  waId: string | null
  fromMe: boolean
  body: string
  kind: string
  sentAt: Date
  senderName: string
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

function describe(message: WAMessage): { body: string; kind: string } | null {
  const content = normalizeMessageContent(message.message)
  if (!content) return null
  const type = getContentType(content)
  if (!type) return null
  switch (type) {
    case 'conversation':
      return { body: content.conversation ?? '', kind: 'text' }
    case 'extendedTextMessage':
      return { body: content.extendedTextMessage?.text ?? '', kind: 'text' }
    case 'imageMessage':
      return { body: content.imageMessage?.caption ?? '', kind: 'image' }
    case 'videoMessage':
      return { body: content.videoMessage?.caption ?? '', kind: 'video' }
    case 'audioMessage':
      return { body: '', kind: 'audio' }
    case 'documentMessage':
      return {
        body: content.documentMessage?.fileName ?? '',
        kind: 'document',
      }
    case 'documentWithCaptionMessage':
      return {
        body:
          content.documentWithCaptionMessage?.message?.documentMessage
            ?.fileName ?? '',
        kind: 'document',
      }
    case 'stickerMessage':
      return { body: '', kind: 'sticker' }
    case 'locationMessage':
    case 'liveLocationMessage':
      return { body: '', kind: 'location' }
    case 'contactMessage':
    case 'contactsArrayMessage':
      return { body: '', kind: 'contact' }
    case 'pollCreationMessage':
    case 'pollCreationMessageV2':
    case 'pollCreationMessageV3':
      return { body: '', kind: 'poll' }
    case 'protocolMessage':
    case 'senderKeyDistributionMessage':
    case 'reactionMessage':
      return null
    default:
      return { body: '', kind: 'other' }
  }
}

export function previewFor(body: string, kind: string) {
  const text = body.trim()
  if (text) return text.slice(0, 200)
  return KIND_LABEL[kind] ?? KIND_LABEL.other
}

function digitsOf(jid: string | undefined | null) {
  if (!jid) return null
  const digits = jid.split('@')[0]?.split(':')[0]?.replace(/\D/g, '') ?? ''
  return digits || null
}

async function resolvePhone(socket: WASocket, jid: string, alt?: string) {
  if (!isLidUser(jid)) return digitsOf(jid)
  if (alt && !isLidUser(alt)) return digitsOf(alt)
  try {
    const pn = await socket.signalRepository.lidMapping.getPNForLID(jid)
    return digitsOf(pn)
  } catch {
    return null
  }
}

async function upsertConversation(
  db: Db,
  input: {
    lineId: string
    jid: string
    phone: string | null
    name: string
  },
) {
  const { rows } = await db.query(
    `INSERT INTO whatsapp_conversations
      (id, line_id, jid, phone, contact_name, last_message_at)
     VALUES ($1, $2, $3, $4, $5, 'epoch'::timestamptz)
     ON CONFLICT (line_id, jid) DO UPDATE
       SET phone = COALESCE(EXCLUDED.phone, whatsapp_conversations.phone),
           contact_name = CASE
             WHEN whatsapp_conversations.contact_name = '' THEN EXCLUDED.contact_name
             ELSE whatsapp_conversations.contact_name
           END
     RETURNING id`,
    [randomUUID(), input.lineId, input.jid, input.phone, input.name.slice(0, 160)],
  )
  return String(rows[0].id)
}

async function storeMessage(db: Db, conversationId: string, stored: Stored) {
  const { rowCount } = await db.query(
    `INSERT INTO whatsapp_messages
      (id, conversation_id, wa_id, from_me, body, kind, sent_at, sender_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT DO NOTHING`,
    [
      randomUUID(),
      conversationId,
      stored.waId,
      stored.fromMe,
      stored.body,
      stored.kind,
      stored.sentAt,
      stored.senderName.slice(0, 160),
    ],
  )
  if (!rowCount) return false
  await db.query(
    `UPDATE whatsapp_conversations
        SET last_preview = CASE WHEN $2::timestamptz >= last_message_at THEN $3 ELSE last_preview END,
            last_message_at = GREATEST(last_message_at, $2::timestamptz),
            unread_count = unread_count + CASE WHEN $4 THEN 0 ELSE 1 END
      WHERE id = $1`,
    [conversationId, stored.sentAt, previewFor(stored.body, stored.kind), stored.fromMe],
  )
  return true
}

export function ingestMessages(
  socket: WASocket,
  lineId: string,
  messages: WAMessage[],
  options: { countUnread: boolean },
) {
  return enqueue(async (db) => {
    const touched = new Set<string>()
    for (const message of messages) {
      const remote = message.key?.remoteJid
      if (!remote || isJidGroup(remote)) continue
      if (remote === 'status@broadcast' || remote.endsWith('@newsletter')) {
        continue
      }
      const described = describe(message)
      if (!described) continue
      const jid = jidNormalizedUser(remote)
      const phone = await resolvePhone(socket, jid, message.key?.remoteJidAlt)
      const fromMe = Boolean(message.key?.fromMe)
      const name = fromMe ? '' : String(message.pushName ?? '')
      const conversationId = await upsertConversation(db, {
        lineId,
        jid,
        phone,
        name,
      })
      const seconds = Number(message.messageTimestamp ?? 0)
      await storeMessage(db, conversationId, {
        waId: message.key?.id ?? null,
        fromMe,
        body: described.body,
        kind: described.kind,
        sentAt: seconds ? new Date(seconds * 1000) : new Date(),
        senderName: name,
      })
      if (!fromMe) touched.add(conversationId)
    }
    if (!options.countUnread && touched.size) {
      await db.query(
        `UPDATE whatsapp_conversations
            SET unread_count = 0
          WHERE id = ANY($1::text[])`,
        [[...touched]],
      )
    }
  })
}

export function rememberContacts(
  lineId: string,
  contacts: Array<{
    id?: string
    lid?: string
    phoneNumber?: string
    name?: string
    notify?: string
    verifiedName?: string
  }>,
) {
  return enqueue(async (db) => {
    for (const contact of contacts) {
      const name = contact.name ?? contact.verifiedName ?? contact.notify
      if (!name) continue
      const ids = [contact.id, contact.lid, contact.phoneNumber]
        .filter((value): value is string => Boolean(value))
        .map((value) => jidNormalizedUser(value))
      if (!ids.length) continue
      const phone = digitsOf(contact.phoneNumber)
      for (const jid of new Set(ids)) {
        await db.query(
          `INSERT INTO whatsapp_contacts (line_id, jid, name, phone)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (line_id, jid) DO UPDATE
             SET name = EXCLUDED.name,
                 phone = COALESCE(EXCLUDED.phone, whatsapp_contacts.phone)`,
          [lineId, jid, name.slice(0, 160), phone],
        )
      }
      await db.query(
        `UPDATE whatsapp_conversations
            SET contact_name = $3,
                phone = COALESCE(phone, $4)
          WHERE line_id = $1 AND jid = ANY($2::text[])`,
        [lineId, ids, name.slice(0, 160), phone],
      )
    }
  })
}

export async function recordOutgoing(input: {
  lineId: string
  jid: string
  phone: string | null
  text: string
  waId: string | null
}) {
  const conversationId = await upsertConversation(pool, {
    lineId: input.lineId,
    jid: input.jid,
    phone: input.phone,
    name: '',
  })
  await storeMessage(pool, conversationId, {
    waId: input.waId,
    fromMe: true,
    body: input.text,
    kind: 'text',
    sentAt: new Date(),
    senderName: '',
  })
  return conversationId
}
