import { randomUUID } from 'node:crypto'
import type { Express, NextFunction, Request, Response } from 'express'
import { normalizeBrazilPhone } from '../../src/config/collectionNotice'
import { pool } from '../db'
import { readAgentSettings, runCollectionAgent } from './agent'
import {
  lineSnapshot,
  restartLine,
  fetchOlderHistory,
  sendToJid,
  startLine,
  stopLine,
  unlinkLine,
} from './gateway'

type StaffRequest = Request & {
  user?: { id: string; role: 'admin' | 'operator_sede' | 'operator_obra' }
}

function requireCollections(
  request: StaffRequest,
  response: Response,
  next: NextFunction,
) {
  if (
    request.user?.role !== 'admin' &&
    request.user?.role !== 'operator_sede'
  ) {
    response.status(403).json({
      error: 'A cobrança está disponível somente para a equipe da sede.',
    })
    return
  }
  next()
}

function siglaFrom(name: string) {
  const parts = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/\s+/)
    .filter(Boolean)
  const letters = parts.map((part) => part[0] ?? '').join('')
  return (letters || name).slice(0, 2).toUpperCase()
}

function isLineId(value: string) {
  return /^cobranca-[a-z0-9-]{8,40}$/.test(value)
}

export function registerCobrancaRoutes(app: Express) {
  app.get(
    '/api/cobranca/whatsapp',
    requireCollections,
    async (_request, response) => {
      const { rows } = await pool.query(
        `SELECT id, name, sigla
           FROM whatsapp_lines
          WHERE department = 'cobranca'
          ORDER BY created_at`,
      )
      const lines = rows.map((row) => ({
        id: String(row.id),
        name: String(row.name),
        sigla: String(row.sigla),
        department: 'cobranca' as const,
        ...lineSnapshot(String(row.id)),
      }))
      response.json({ lines, agent: await readAgentSettings() })
    },
  )

  app.post(
    '/api/cobranca/lines',
    requireCollections,
    async (request, response) => {
      const name = String(request.body?.name ?? '').trim()
      if (name.length < 2 || name.length > 120) {
        response.status(400).json({ error: 'Informe o nome de quem vai conectar o celular.' })
        return
      }
      const id = `cobranca-${randomUUID().slice(0, 8)}`
      const { rows } = await pool.query(
        `INSERT INTO whatsapp_lines (id, department, name, sigla)
         VALUES ($1, 'cobranca', $2, $3)
         RETURNING id, name, sigla`,
        [id, name, siglaFrom(name)],
      )
      response.status(201).json({
        id: String(rows[0].id),
        name: String(rows[0].name),
        sigla: String(rows[0].sigla),
        department: 'cobranca',
        ...lineSnapshot(id),
      })
    },
  )

  app.delete(
    '/api/cobranca/lines/:id',
    requireCollections,
    async (request, response) => {
      const id = String(request.params.id)
      if (!isLineId(id)) {
        response.status(400).json({ error: 'Celular inválido.' })
        return
      }
      await unlinkLine(id)
      await pool.query(
        `DELETE FROM whatsapp_lines WHERE id = $1 AND department = 'cobranca'`,
        [id],
      )
      response.status(204).end()
    },
  )

  app.post(
    '/api/cobranca/lines/:id/channel',
    requireCollections,
    async (request, response) => {
      const id = String(request.params.id)
      const action = String(request.body?.action ?? '')
      if (!isLineId(id)) {
        response.status(400).json({ error: 'Celular inválido.' })
        return
      }
      const { rowCount } = await pool.query(
        `SELECT 1 FROM whatsapp_lines WHERE id = $1 AND department = 'cobranca'`,
        [id],
      )
      if (!rowCount) {
        response.status(404).json({ error: 'Celular não encontrado.' })
        return
      }
      if (action === 'start') {
        response.json(await startLine(id))
        return
      }
      if (action === 'stop') {
        response.json(await stopLine(id))
        return
      }
      if (action === 'restart') {
        response.json(await restartLine(id))
        return
      }
      if (action === 'unlink') {
        response.json(await unlinkLine(id))
        return
      }
      response.status(400).json({ error: 'Ação de conexão inválida.' })
    },
  )

  app.get(
    '/api/cobranca/lines/:id/conversations',
    requireCollections,
    async (request, response) => {
      const id = String(request.params.id)
      if (!isLineId(id)) {
        response.status(400).json({ error: 'Celular inválido.' })
        return
      }
      const search = String(request.query.q ?? '').trim()
      const { rows } = await pool.query(
        `SELECT c.id, c.jid, COALESCE(c.phone, ct.phone) AS phone,
                COALESCE(NULLIF(c.contact_name, ''), ct.name, '') AS contact_name,
                c.last_preview, c.last_message_at, c.unread_count
           FROM whatsapp_conversations c
           LEFT JOIN LATERAL (
             SELECT name, phone
               FROM whatsapp_contacts k
              WHERE k.line_id = c.line_id
                AND (k.jid = c.jid
                     OR (c.phone IS NOT NULL AND k.jid = c.phone || '@s.whatsapp.net'))
              LIMIT 1
           ) ct ON true
          WHERE c.line_id = $1
            AND c.last_preview <> ''
            AND ($2 = ''
                 OR COALESCE(NULLIF(c.contact_name, ''), ct.name, '') ILIKE '%' || $2 || '%'
                 OR COALESCE(c.phone, ct.phone, '') LIKE '%' || regexp_replace($2, '\\D', '', 'g') || '%')
          ORDER BY c.last_message_at DESC
          LIMIT 500`,
        [id, search],
      )
      response.json(
        rows.map((row) => ({
          id: String(row.id),
          jid: String(row.jid),
          phone: row.phone ? String(row.phone) : null,
          contactName: String(row.contact_name ?? ''),
          lastPreview: String(row.last_preview ?? ''),
          lastMessageAt: new Date(String(row.last_message_at)).toISOString(),
          unreadCount: Number(row.unread_count ?? 0),
        })),
      )
    },
  )

  app.get(
    '/api/cobranca/conversations/:id/messages',
    requireCollections,
    async (request, response) => {
      const id = String(request.params.id)
      const { rows } = await pool.query(
        `SELECT id, from_me, body, kind, sent_at, sender_name
           FROM whatsapp_messages
          WHERE conversation_id = $1
          ORDER BY sent_at ASC
          LIMIT 5000`,
        [id],
      )
      await pool.query(
        `UPDATE whatsapp_conversations SET unread_count = 0 WHERE id = $1`,
        [id],
      )
      response.json(
        rows.map((row) => ({
          id: String(row.id),
          fromMe: Boolean(row.from_me),
          body: String(row.body ?? ''),
          kind: String(row.kind ?? 'text'),
          sentAt: new Date(String(row.sent_at)).toISOString(),
          senderName: String(row.sender_name ?? ''),
        })),
      )
    },
  )

  app.post(
    '/api/cobranca/conversations/:id/history',
    requireCollections,
    async (request, response) => {
      const id = String(request.params.id)
      const { rows } = await pool.query(
        `SELECT c.line_id, c.jid, m.wa_id, m.from_me, m.sent_at
           FROM whatsapp_conversations c
           JOIN LATERAL (
             SELECT wa_id, from_me, sent_at
               FROM whatsapp_messages
              WHERE conversation_id = c.id AND wa_id IS NOT NULL
              ORDER BY sent_at ASC
              LIMIT 1
           ) m ON true
          WHERE c.id = $1`,
        [id],
      )
      if (!rows[0]) {
        response.status(404).json({
          error: 'Ainda não há uma mensagem desta conversa para buscar as anteriores.',
        })
        return
      }
      try {
        await fetchOlderHistory(
          String(rows[0].line_id),
          String(rows[0].jid),
          String(rows[0].wa_id),
          Boolean(rows[0].from_me),
          new Date(String(rows[0].sent_at)),
        )
      } catch (error) {
        response.status(409).json({
          error:
            error instanceof Error
              ? error.message
              : 'Não foi possível buscar o histórico.',
        })
        return
      }
      response.json({ ok: true })
    },
  )

  app.post(
    '/api/cobranca/conversations/:id/messages',
    requireCollections,
    async (request, response) => {
      const id = String(request.params.id)
      const text = String(request.body?.text ?? '').trim()
      if (!text || text.length > 4000) {
        response.status(400).json({ error: 'Digite a mensagem.' })
        return
      }
      const { rows } = await pool.query(
        `SELECT line_id, jid, phone FROM whatsapp_conversations WHERE id = $1`,
        [id],
      )
      if (!rows[0]) {
        response.status(404).json({ error: 'Conversa não encontrada.' })
        return
      }
      try {
        await sendToJid(
          String(rows[0].line_id),
          String(rows[0].jid),
          rows[0].phone ? String(rows[0].phone) : null,
          text,
        )
      } catch (error) {
        response.status(409).json({
          error:
            error instanceof Error
              ? error.message
              : 'Não foi possível enviar a mensagem.',
        })
        return
      }
      response.status(201).json({ ok: true })
    },
  )

  app.post(
    '/api/cobranca/lines/:id/conversations',
    requireCollections,
    async (request, response) => {
      const id = String(request.params.id)
      const phone = normalizeBrazilPhone(String(request.body?.phone ?? ''))
      const text = String(request.body?.text ?? '').trim()
      if (!isLineId(id) || !phone) {
        response.status(400).json({
          error:
            'Informe um WhatsApp válido. Fora do Brasil, comece com + e o código do país.',
        })
        return
      }
      if (!text || text.length > 4000) {
        response.status(400).json({ error: 'Digite a mensagem.' })
        return
      }
      try {
        const conversationId = await sendToJid(
          id,
          `${phone}@s.whatsapp.net`,
          phone,
          text,
        )
        response.status(201).json({ id: conversationId })
      } catch (error) {
        response.status(409).json({
          error:
            error instanceof Error
              ? error.message
              : 'Não foi possível enviar a mensagem.',
        })
      }
    },
  )

  app.put(
    '/api/cobranca/agent',
    requireCollections,
    async (request, response) => {
      const enabled = true
      const installmentValue = Number(request.body?.installmentValue)
      const lineId =
        typeof request.body?.lineId === 'string' && request.body.lineId
          ? String(request.body.lineId)
          : null
      if (!Number.isFinite(installmentValue) || installmentValue < 0) {
        response.status(400).json({ error: 'Informe o valor da parcela.' })
        return
      }
      if (lineId && !isLineId(lineId)) {
        response.status(400).json({ error: 'Celular de envio inválido.' })
        return
      }
      await pool.query(
        `UPDATE collection_agent_settings
            SET enabled = $1,
                installment_value = $2,
                line_id = $3,
                updated_at = now()
          WHERE id = true`,
        [enabled, installmentValue, lineId],
      )
      void runCollectionAgent().catch(() => undefined)
      response.json(await readAgentSettings())
    },
  )

  app.get(
    '/api/cobranca/lances',
    requireCollections,
    async (request, response) => {
      const building = String(request.query.building ?? '')
      const group = String(request.query.group ?? '')
      if (!building) {
        response.status(400).json({ error: 'Informe o condomínio do evento.' })
        return
      }
      const { rows } = await pool.query(
        `SELECT e.id, e.associate_code, e.participant,
                e.offered_installments, e.anticipated_installments,
                e.offer_status, e.whatsapp_phone,
                d.status AS dispatch_status, d.error AS dispatch_error,
                d.amount AS dispatch_amount, d.sent_at
           FROM anticipation_entries e
           JOIN anticipation_sessions s ON s.id = e.session_id
           LEFT JOIN anticipation_dispatches d ON d.entry_id = e.id
          WHERE s.building = $1
            AND ($2 = '' OR s.draw_group = $2)
            AND s.status <> 'closed'
            AND (
              e.offered_installments > 0
              OR e.anticipated_installments > 0
              OR e.offer_status = 'confirmed'
            )
          ORDER BY
            CASE e.offer_status WHEN 'confirmed' THEN 0 ELSE 1 END,
            (e.paid_installments + e.anticipated_installments + e.offered_installments) DESC,
            e.associate_code::integer`,
        [building, group],
      )
      response.json(
        rows.map((row) => ({
          id: String(row.id),
          associateCode: String(row.associate_code),
          participant: String(row.participant ?? ''),
          offeredInstallments: Number(row.offered_installments),
          anticipatedInstallments: Number(row.anticipated_installments),
          offerStatus: String(row.offer_status),
          whatsappPhone: row.whatsapp_phone ? String(row.whatsapp_phone) : '',
          dispatchStatus: row.dispatch_status ? String(row.dispatch_status) : null,
          dispatchError: row.dispatch_error ? String(row.dispatch_error) : '',
          dispatchAmount:
            row.dispatch_amount === null || row.dispatch_amount === undefined
              ? null
              : Number(row.dispatch_amount),
          sentAt: row.sent_at ? new Date(String(row.sent_at)).toISOString() : null,
        })),
      )
    },
  )

  app.patch(
    '/api/cobranca/entries/:id/phone',
    requireCollections,
    async (request, response) => {
      const raw = String(request.body?.phone ?? '')
      const phone = raw.trim() === '' ? null : normalizeBrazilPhone(raw)
      if (raw.trim() && !phone) {
        response.status(400).json({
          error:
            'Informe um WhatsApp válido. Fora do Brasil, comece com + e o código do país.',
        })
        return
      }
      const { rowCount } = await pool.query(
        `UPDATE anticipation_entries
            SET whatsapp_phone = $2
          WHERE id = $1`,
        [request.params.id, phone],
      )
      if (!rowCount) {
        response.status(404).json({ error: 'Associado não encontrado.' })
        return
      }
      void runCollectionAgent().catch(() => undefined)
      response.json({ phone: phone ?? '' })
    },
  )
}
