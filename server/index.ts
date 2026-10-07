import 'dotenv/config'
import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import bcrypt from 'bcryptjs'
import cookieParser from 'cookie-parser'
import express, {
  type NextFunction,
  type Request,
  type Response,
} from 'express'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import type { PoolClient } from 'pg'
import { BUILDING_CONFIGS } from '../src/config/building'
import { isDrawGroup, validateAssociateCode } from '../src/config/drawGroups'
import {
  choiceSourceAfterTurn,
  isOfferDecisionOpen,
  offerDecisionUntil,
} from '../src/config/anticipation'
import { EDGE_LANDMARK_IDS } from '../src/config/surroundings'
import { normalizeBrazilPhone } from '../src/config/collectionNotice'
import { pool, transaction } from './db'
import { runCollectionAgent, startCollectionAgent } from './whatsapp/agent'
import { registerCobrancaRoutes } from './whatsapp/routes'

type SessionUser = {
  id: string
  username: string
  role: 'admin' | 'operator_sede' | 'operator_obra'
}

type AuthRequest = Request & { user?: SessionUser }
type Building = 'odd' | 'even' | 'jardim-artes' | 'cond-iracema'

class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

const BUILDINGS: Building[] = [
  'odd',
  'even',
  'jardim-artes',
  'cond-iracema',
]
const SOLAR_ILLUSTRATIONS = ['sunrise', 'sunset', 'future-green'] as const

/** Mantém apenas ilustrações conhecidas, sem repetição e na ordem do catálogo. */
function normalizeIllustrations(value: unknown) {
  const list = Array.isArray(value) ? value.map(String) : []
  return SOLAR_ILLUSTRATIONS.filter((illustration) =>
    list.includes(illustration),
  )
}

function normalizeLandmarks(value: unknown) {
  const list = Array.isArray(value) ? value.map(String) : []
  return EDGE_LANDMARK_IDS.filter((landmark) => list.includes(landmark))
}
const BUILDING_LIMITS: Record<
  Building,
  {
    minFloor: number
    floorCount: number
    endingCount: number
    groundEndingCount?: number
  }
> = {
  odd: { minFloor: 1, floorCount: 36, endingCount: 4 },
  even: { minFloor: 1, floorCount: 28, endingCount: 8 },
  'jardim-artes': { minFloor: 1, floorCount: 27, endingCount: 4 },
  'cond-iracema': {
    minFloor: 0,
    floorCount: 28,
    endingCount: 8,
    groundEndingCount: 7,
  },
}

const app = express()
const sessionCookie = 'evo_session'
const associateCookie = 'evo_associate'
const port = Number(process.env.PORT ?? 3015)
const mathChallenges = new Map<
  string,
  { answer: number; expiresAt: number }
>()

app.use(helmet({ contentSecurityPolicy: false }))
app.use(express.json({ limit: '2mb' }))
app.use(cookieParser())

const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex')

const reservationData = (row: Record<string, unknown>) => ({
  ball: String(row.ball ?? ''),
  participant: String(row.participant ?? ''),
  choiceSource: String(row.choice_source ?? 'draw'),
  anticipationEntryId: row.anticipation_entry_id
    ? String(row.anticipation_entry_id)
    : undefined,
  assignedAt: new Date(String(row.created_at)).toISOString(),
  createdBy: String(row.created_by_name ?? 'Registro anterior'),
  updatedAt: row.updated_at
    ? new Date(String(row.updated_at)).toISOString()
    : undefined,
  updatedBy: row.updated_by_name
    ? String(row.updated_by_name)
    : undefined,
  lastJustification: row.last_justification
    ? String(row.last_justification)
    : undefined,
})

async function authenticateRequest(
  request: AuthRequest,
  response: Response,
  next: NextFunction,
) {
  const token = request.cookies[sessionCookie]
  if (!token || typeof token !== 'string') {
    response.status(401).json({ error: 'Sessão necessária.' })
    return
  }
  const { rows } = await pool.query<SessionUser>(
    `SELECT u.id, u.username, u.role
       FROM app_sessions s
       JOIN app_users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [hashToken(token)],
  )
  if (!rows[0]) {
    response.clearCookie(sessionCookie)
    response.status(401).json({ error: 'Sessão expirada.' })
    return
  }
  request.user = rows[0]
  next()
}

function requireAdmin(
  request: AuthRequest,
  response: Response,
  next: NextFunction,
) {
  if (request.user?.role !== 'admin') {
    response.status(403).json({ error: 'Acesso exclusivo do administrador.' })
    return
  }
  next()
}

function requireAnticipationAccess(
  request: AuthRequest,
  response: Response,
  next: NextFunction,
) {
  if (
    request.user?.role !== 'admin' &&
    request.user?.role !== 'operator_sede'
  ) {
    response.status(403).json({
      error: 'A antecipação está disponível somente para a equipe da sede.',
    })
    return
  }
  next()
}

function validApartment(building: Building, apartmentId: string) {
  if (!/^\d{2,3}$/.test(apartmentId)) return false
  const ending = Number(apartmentId.slice(-1))
  const floor = Number(apartmentId.slice(0, -1))
  const limits = BUILDING_LIMITS[building]
  const endingCount =
    floor === 0
      ? (limits.groundEndingCount ?? limits.endingCount)
      : limits.endingCount
  return (
    floor >= limits.minFloor &&
    floor <= limits.floorCount &&
    ending >= 1 &&
    ending <= endingCount
  )
}

async function insertAudit(
  client: PoolClient,
  input: {
    storageId: string
    action: 'created' | 'updated' | 'removed' | 'imported'
    actor: SessionUser
    reason?: string
    before?: unknown
    after?: unknown
  },
) {
  const id = randomUUID()
  const { rows } = await client.query(
    `INSERT INTO audit_events
      (id, storage_id, action, actor_id, actor_name, reason, before_data, after_data)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING created_at`,
    [
      id,
      input.storageId,
      input.action,
      input.actor.id,
      input.actor.username,
      input.reason ?? '',
      input.before ? JSON.stringify(input.before) : null,
      input.after ? JSON.stringify(input.after) : null,
    ],
  )
  return {
    id,
    apartmentId: input.storageId,
    action: input.action,
    actor: input.actor.username,
    timestamp: new Date(rows[0].created_at).toISOString(),
    reason: input.reason ?? '',
    before: input.before,
    after: input.after,
  }
}

app.post(
  '/api/auth/login',
  rateLimit({ windowMs: 60_000, limit: 10 }),
  async (request, response) => {
    const username = String(request.body?.username ?? '').trim()
    const password = String(request.body?.password ?? '')
    const { rows } = await pool.query<
      SessionUser & { password_hash: string }
    >(
      `SELECT id, username, role, password_hash
         FROM app_users WHERE lower(username) = lower($1)`,
      [username],
    )
    const user = rows[0]
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      response.status(401).json({ error: 'Usuário ou senha inválidos.' })
      return
    }
    const token = randomBytes(32).toString('base64url')
    await pool.query(
      `INSERT INTO app_sessions (token_hash, user_id, expires_at)
       VALUES ($1, $2, now() + interval '12 hours')`,
      [hashToken(token), user.id],
    )
    response.cookie(sessionCookie, token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.COOKIE_SECURE === 'true',
      maxAge: 12 * 60 * 60 * 1000,
    })
    response.json({ id: user.id, username: user.username, role: user.role })
  },
)

app.post('/api/auth/logout', async (request, response) => {
  const token = request.cookies[sessionCookie]
  if (typeof token === 'string') {
    await pool.query('DELETE FROM app_sessions WHERE token_hash = $1', [
      hashToken(token),
    ])
  }
  response.clearCookie(sessionCookie)
  response.status(204).end()
})

app.get(
  '/api/auth/me',
  authenticateRequest,
  (request: AuthRequest, response) => {
    response.json(request.user)
  },
)

app.get('/api/public/portal/challenge', (_request, response) => {
  purgeExpiredChallenges()
  const left = randomInt(1, 10)
  const right = randomInt(1, 10)
  const id = randomUUID()
  mathChallenges.set(id, {
    answer: left + right,
    expiresAt: Date.now() + 10 * 60_000,
  })
  response.json({
    id,
    question: `Quanto é ${left} + ${right} =`,
  })
})

app.post(
  '/api/public/portal/access',
  rateLimit({ windowMs: 60_000, limit: 12 }),
  async (request, response) => {
    const associateCode = String(request.body?.associateCode ?? '').trim()
    const documentTail = String(request.body?.documentTail ?? '').trim()
    const challengeId = String(request.body?.challengeId ?? '')
    const answer = Number(request.body?.answer)
    const challenge = mathChallenges.get(challengeId)
    mathChallenges.delete(challengeId)
    if (!challenge || challenge.expiresAt <= Date.now()) {
      response.status(400).json({
        error: 'A verificação expirou. Tente novamente.',
      })
      return
    }
    if (!Number.isInteger(answer) || answer !== challenge.answer) {
      response.status(400).json({ error: 'Resposta da verificação incorreta.' })
      return
    }
    if (!/^\d{6}$/.test(associateCode) || !/^\d{5}$/.test(documentTail)) {
      response.status(400).json({
        error: 'Informe o contrato com 6 dígitos e os 5 últimos do CPF.',
      })
      return
    }
    const { rows } = await pool.query(
      `SELECT e.id AS entry_id, s.id AS session_id
         FROM anticipation_entries e
         JOIN anticipation_sessions s ON s.id = e.session_id
        WHERE e.associate_code = $1
          AND e.document_tail = $2
          AND s.status <> 'closed'
          AND NOT EXISTS (
            SELECT 1
              FROM contemplated_associates c
             WHERE c.building = s.building
               AND c.associate_code = e.associate_code
          )
          AND NOT EXISTS (
            SELECT 1
              FROM apartment_reservations r
             WHERE r.building = s.building
               AND lower(trim(r.ball)) = lower(e.associate_code)
          )
        ORDER BY CASE s.status WHEN 'active' THEN 0 ELSE 1 END, s.created_at DESC
        LIMIT 1`,
      [associateCode, documentTail],
    )
    if (!rows[0]) {
      response.status(401).json({
        error:
          'Acesso indisponível: contrato não está no evento atual ou já foi contemplado.',
      })
      return
    }
    const token = randomBytes(32).toString('hex')
    await pool.query(
      `INSERT INTO associate_portal_sessions
        (token_hash, entry_id, session_id, expires_at)
       VALUES ($1, $2, $3, now() + interval '8 hours')`,
      [hashToken(token), rows[0].entry_id, rows[0].session_id],
    )
    response.cookie(associateCookie, token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.COOKIE_SECURE === 'true',
      maxAge: 8 * 60 * 60 * 1000,
    })
    response.json({ ok: true })
  },
)

app.get(
  '/api/public/portal',
  authenticateAssociate,
  async (request: AssociateRequest, response) => {
    const identity = request.associate
    if (!identity) return
    const { rows } = await pool.query(
      `SELECT s.*, u.username AS created_by_name
         FROM anticipation_sessions s
         LEFT JOIN app_users u ON u.id = s.created_by
        WHERE s.id = $1`,
      [identity.sessionId],
    )
    if (!rows[0]) {
      response.status(404).json({ error: 'Sessão não encontrada.' })
      return
    }
    await expireUnconfirmedOffers()
    const session = await anticipationSessionData(pool, rows[0])
    const ranking = publicRankingEntries(session.entries)
    const current = session.entries.find((item) => item.id === identity.entryId)
    const yours = current
      ? ranking.find((entry) => entry.associateCode === current.associateCode)
      : null
    let you = null
    if (current && yours) {
      const rankingOpen =
        session.status === 'draft' && current.status === 'waiting'
      const deadline = session.confirmationDeadline
      const decisionOpen =
        rankingOpen &&
        current.offerStatus !== 'withdrawn' &&
        isOfferDecisionOpen(current.offerSelectedAt, Date.now(), deadline)
      you = {
        ...yours,
        canSetOffer:
          rankingOpen &&
          current.offerStatus !== 'withdrawn' &&
          current.offerStatus !== 'confirmed' &&
          (deadline
            ? isOfferDecisionOpen(current.offerSelectedAt, Date.now(), deadline)
            : !current.offerSelectedAt ||
              isOfferDecisionOpen(current.offerSelectedAt)),
        canConfirm:
          decisionOpen &&
          current.offerStatus === 'pending' &&
          current.offeredInstallments > 0,
        canWithdraw: decisionOpen && current.offeredInstallments > 0,
        offerDecisionUntil: offerDecisionUntil(
          current.offerSelectedAt,
          deadline,
        ),
        whatsappPhone: current.whatsappPhone ?? '',
      }
    }
    response.json({
      title: session.title,
      status: session.status,
      startsAt: session.startsAt,
      endsAt: session.endsAt,
      liveUrl: session.liveUrl,
      nextSource: session.nextSource,
      anticipatorSlots: session.anticipatorSlots,
      confirmationDeadline: session.confirmationDeadline,
      ranking,
      you,
    })
  },
)

app.post(
  '/api/public/portal/offer',
  authenticateAssociate,
  async (request: AssociateRequest, response) => {
    const identity = request.associate
    if (!identity) return
    const action = String(request.body?.action ?? '')
    if (action !== 'confirm' && action !== 'withdraw' && action !== 'set') {
      response.status(400).json({
        error: 'Informe se deseja antecipar, manter ou recusar.',
      })
      return
    }
    let confirmedNow = false
    try {
      await transaction(async (client) => {
        await expireUnconfirmedOffers(client)
        const { rows } = await client.query(
          `SELECT e.*, s.status AS session_status,
                  s.confirmation_deadline
             FROM anticipation_entries e
             JOIN anticipation_sessions s ON s.id = e.session_id
            WHERE e.id = $1 AND e.session_id = $2
            FOR UPDATE OF e`,
          [identity.entryId, identity.sessionId],
        )
        const entry = rows[0]
        if (!entry) {
          throw new ApiError(404, 'Associado não encontrado no ranking.')
        }
        if (entry.session_status !== 'draft' || entry.status !== 'waiting') {
          throw new ApiError(
            409,
            'O ranking já foi fechado para novas antecipações.',
          )
        }
        if (entry.offer_status === 'withdrawn') {
          throw new ApiError(409, 'Esta antecipação já foi recusada.')
        }
        if (typeof request.body?.whatsappPhone === 'string') {
          const rawPhone = String(request.body.whatsappPhone)
          const phone =
            rawPhone.trim() === '' ? null : normalizeBrazilPhone(rawPhone)
          if (rawPhone.trim() && !phone) {
            throw new ApiError(
              400,
              'Informe um WhatsApp válido. Fora do Brasil, comece com + e o código do país.',
            )
          }
          await client.query(
            `UPDATE anticipation_entries
                SET whatsapp_phone = $2
              WHERE id = $1`,
            [entry.id, phone],
          )
        }
        const selectedAt = entry.offer_selected_at
          ? new Date(String(entry.offer_selected_at)).toISOString()
          : undefined
        const deadline = entry.confirmation_deadline
          ? new Date(String(entry.confirmation_deadline)).toISOString()
          : null
        if (action === 'set') {
          if (entry.offer_status === 'confirmed') {
            throw new ApiError(
              409,
              'A antecipação já foi confirmada e não pode ser alterada.',
            )
          }
          if (
            (selectedAt || deadline) &&
            !isOfferDecisionOpen(selectedAt, Date.now(), deadline)
          ) {
            throw new ApiError(
              409,
              'O prazo para alterar a antecipação já encerrou.',
            )
          }
          const offeredInstallments = Number(request.body?.offeredInstallments)
          if (
            !Number.isInteger(offeredInstallments) ||
            offeredInstallments < 10 ||
            offeredInstallments > 30
          ) {
            throw new ApiError(
              400,
              'Informe de 10 a 30 parcelas para antecipar.',
            )
          }
          await client.query(
            `UPDATE anticipation_entries
                SET offered_installments = $2,
                    offer_status = 'pending',
                    offer_selected_at = COALESCE(offer_selected_at, now())
              WHERE id = $1`,
            [entry.id, offeredInstallments],
          )
          return
        }
        if (!isOfferDecisionOpen(selectedAt, Date.now(), deadline)) {
          throw new ApiError(
            409,
            'O prazo para manter ou recusar já encerrou.',
          )
        }
        if (Number(entry.offered_installments) === 0) {
          throw new ApiError(409, 'Não há parcelas antecipadas para confirmar.')
        }
        if (action === 'confirm') {
          await client.query(
            `UPDATE anticipation_entries
                SET anticipated_installments = offered_installments,
                    offered_installments = 0,
                    offer_status = 'confirmed'
              WHERE id = $1`,
            [entry.id],
          )
          confirmedNow = true
        } else {
          await client.query(
            `UPDATE anticipation_entries
                SET offer_status = 'withdrawn',
                    offered_installments = 0
              WHERE id = $1`,
            [entry.id],
          )
        }
      })
    } catch (error) {
      const status = (error as { status?: number }).status
      if (status) {
        response.status(status).json({ error: (error as Error).message })
        return
      }
      throw error
    }
    if (confirmedNow) {
      // O associado confirmou o lance: a cobrança envia o valor na hora.
      void runCollectionAgent().catch(() => undefined)
    }
    response.json({ ok: true })
  },
)

app.post('/api/public/portal/logout', async (request, response) => {
  const token = request.cookies[associateCookie]
  if (typeof token === 'string') {
    await pool.query(
      'DELETE FROM associate_portal_sessions WHERE token_hash = $1',
      [hashToken(token)],
    )
  }
  response.clearCookie(associateCookie)
  response.status(204).end()
})

app.use('/api', (request, response, next) => {
  if (request.path.startsWith('/public/')) {
    next()
    return
  }
  void authenticateRequest(request, response, next)
})

app.get('/api/users', requireAdmin, async (_request, response) => {
  const { rows } = await pool.query(
    `SELECT id, username, role, created_at AS "createdAt"
       FROM app_users ORDER BY role, lower(username)`,
  )
  response.json(rows)
})

app.post(
  '/api/users',
  requireAdmin,
  async (request: AuthRequest, response) => {
    const username = String(request.body?.username ?? '').trim()
    const password = String(request.body?.password ?? '')
    const role = String(request.body?.role ?? 'operator_sede')
    if (role !== 'operator_sede' && role !== 'operator_obra') {
      response.status(400).json({ error: 'Tipo de operador inválido.' })
      return
    }
    if (username.length < 3 || password.length < 6) {
      response
        .status(400)
        .json({ error: 'Informe usuário e senha com pelo menos 6 caracteres.' })
      return
    }
    try {
      const user = {
        id: randomUUID(),
        username,
        role: role as 'operator_sede' | 'operator_obra',
        createdAt: new Date().toISOString(),
      }
      await pool.query(
        `INSERT INTO app_users (id, username, password_hash, role)
         VALUES ($1, $2, $3, $4)`,
        [user.id, username, await bcrypt.hash(password, 12), role],
      )
      response.status(201).json(user)
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        response.status(409).json({ error: 'Este usuário já existe.' })
        return
      }
      throw error
    }
  },
)

app.delete(
  '/api/users/:id',
  requireAdmin,
  async (request: AuthRequest, response) => {
    if (request.params.id === request.user?.id) {
      response.status(400).json({ error: 'Não é possível remover sua conta.' })
      return
    }
    await pool.query(
      `DELETE FROM app_users WHERE id = $1 AND role <> 'admin'`,
      [request.params.id],
    )
    response.status(204).end()
  },
)

const DECLINE_REASONS = ['refused', 'next-tower', 'no-answer'] as const
const DECLINE_SOURCES = ['draw', 'anticipator'] as const

function declineData(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    building: String(row.building),
    ball: String(row.ball ?? ''),
    participant: String(row.participant ?? ''),
    source: String(row.source ?? 'draw'),
    reason: String(row.reason),
    notes: String(row.notes ?? ''),
    createdBy: String(row.created_by_name ?? 'Registro anterior'),
    createdAt: new Date(String(row.created_at)).toISOString(),
  }
}

function anticipationEntryData(row: Record<string, unknown>) {
  const paidInstallments = Number(row.paid_installments ?? 0)
  const anticipatedInstallments = Number(row.anticipated_installments ?? 0)
  const offeredInstallments = Number(row.offered_installments ?? 0)
  return {
    id: String(row.id),
    associateCode: String(row.associate_code),
    participant: String(row.participant ?? ''),
    paidInstallments,
    anticipatedInstallments,
    offeredInstallments,
    totalInstallments:
      paidInstallments + anticipatedInstallments + offeredInstallments,
    status: String(row.status),
    offerStatus: String(row.offer_status ?? 'pending'),
    whatsappPhone: row.whatsapp_phone ? String(row.whatsapp_phone) : undefined,
    offerSelectedAt: row.offer_selected_at
      ? new Date(String(row.offer_selected_at)).toISOString()
      : undefined,
    apartmentId: row.apartment_id ? String(row.apartment_id) : undefined,
    createdAt: new Date(String(row.created_at)).toISOString(),
  }
}

async function countConsumedAnticipators(
  client: Pick<PoolClient, 'query'>,
  sessionId: string,
) {
  const { rows } = await client.query(
    `SELECT count(*)::int AS used
       FROM anticipation_entries
      WHERE session_id = $1 AND status IN ('selected', 'declined')`,
    [sessionId],
  )
  return Number(rows[0]?.used ?? 0)
}

async function anticipationSessionData(
  client: Pick<PoolClient, 'query'>,
  row: Record<string, unknown>,
) {
  const { rows } = await client.query(
    `SELECT *
       FROM anticipation_entries
      WHERE session_id = $1
      ORDER BY
        (paid_installments + anticipated_installments + offered_installments) DESC,
        associate_code::integer ASC`,
    [row.id],
  )
  const entries = rows.map(anticipationEntryData)
  return {
    id: String(row.id),
    building: String(row.building),
    drawGroup: row.draw_group ? String(row.draw_group) : null,
    title: String(row.title),
    blockLabel: String(row.block_label ?? ''),
    startsAt: new Date(String(row.starts_at)).toISOString(),
    endsAt: new Date(String(row.ends_at)).toISOString(),
    status: String(row.status),
    nextSource: String(row.next_source),
    awaitingNext: Boolean(row.awaiting_next),
    liveUrl: String(row.live_url ?? ''),
    anticipatorSlots: Number(row.anticipator_slots ?? 112),
    anticipatorTurnsUsed: entries.filter(
      (entry) => entry.status === 'selected' || entry.status === 'declined',
    ).length,
    confirmationDeadline: row.confirmation_deadline
      ? new Date(String(row.confirmation_deadline)).toISOString()
      : null,
    portalPath: '/associado',
    entries,
    nextAnticipator:
      entries.find((entry) => entry.status === 'waiting') ?? null,
    createdBy: String(row.created_by_name ?? 'Administrador'),
    createdAt: new Date(String(row.created_at)).toISOString(),
    closedAt: row.closed_at
      ? new Date(String(row.closed_at)).toISOString()
      : undefined,
  }
}

/** Aceita apenas inteiros de 0 a 9999; devolve undefined quando não informado. */
function normalizeSlots(value: unknown) {
  if (value === undefined || value === null || value === '') return undefined
  const slots = Number(value)
  if (!Number.isInteger(slots) || slots < 0 || slots > 9999) return undefined
  return slots
}

/** Prazo do admin ou, sem ele, 24h após o associado informar as parcelas. */
function normalizeConfirmationDeadline(value: unknown) {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  const parsed = new Date(String(value))
  if (Number.isNaN(parsed.getTime())) return undefined
  return parsed.toISOString()
}

/**
 * Quem não confirmou até o prazo passa automaticamente para "não antecipar".
 */
async function expireUnconfirmedOffers(
  client: Pick<PoolClient, 'query'> = pool,
) {
  await client.query(
    `UPDATE anticipation_entries e
        SET offer_status = 'withdrawn',
            offered_installments = 0
       FROM anticipation_sessions s
      WHERE e.session_id = s.id
        AND s.status = 'draft'
        AND e.status = 'waiting'
        AND e.offer_status = 'pending'
        AND e.offered_installments > 0
        AND (
          (
            s.confirmation_deadline IS NOT NULL
            AND s.confirmation_deadline <= now()
          )
          OR (
            s.confirmation_deadline IS NULL
            AND e.offer_selected_at IS NOT NULL
            AND e.offer_selected_at <= now() - interval '24 hours'
          )
        )`,
  )
}

function publicRankingEntries(
  entries: Array<ReturnType<typeof anticipationEntryData>>,
) {
  return entries.map((entry, index) => ({
    position: index + 1,
    associateCode: entry.associateCode,
    paidInstallments: entry.paidInstallments,
    anticipatedInstallments: entry.anticipatedInstallments,
    offeredInstallments: entry.offeredInstallments,
    totalInstallments: entry.totalInstallments,
    status: entry.status,
    offerStatus: entry.offerStatus,
    apartmentId: entry.apartmentId,
  }))
}

function purgeExpiredChallenges() {
  const now = Date.now()
  for (const [id, challenge] of mathChallenges) {
    if (challenge.expiresAt <= now) mathChallenges.delete(id)
  }
}

type AssociateRequest = Request & {
  associate?: {
    entryId: string
    sessionId: string
  }
}

async function authenticateAssociate(
  request: AssociateRequest,
  response: Response,
  next: NextFunction,
) {
  const token = request.cookies[associateCookie]
  if (!token || typeof token !== 'string') {
    response.status(401).json({ error: 'Identifique-se para continuar.' })
    return
  }
  const { rows } = await pool.query(
    `SELECT p.entry_id, p.session_id
       FROM associate_portal_sessions p
       JOIN anticipation_entries e ON e.id = p.entry_id
       JOIN anticipation_sessions s ON s.id = p.session_id
      WHERE p.token_hash = $1
        AND p.expires_at > now()
        AND s.status <> 'closed'
        AND NOT EXISTS (
          SELECT 1
            FROM contemplated_associates c
           WHERE c.building = s.building
             AND c.associate_code = e.associate_code
        )
        AND NOT EXISTS (
          SELECT 1
            FROM apartment_reservations r
           WHERE r.building = s.building
             AND lower(trim(r.ball)) = lower(e.associate_code)
        )`,
    [hashToken(token)],
  )
  if (!rows[0]) {
    await pool.query(
      'DELETE FROM associate_portal_sessions WHERE token_hash = $1',
      [hashToken(token)],
    )
    response.clearCookie(associateCookie)
    response.status(401).json({
      error: 'Evento encerrado ou associado já contemplado.',
    })
    return
  }
  request.associate = {
    entryId: String(rows[0].entry_id),
    sessionId: String(rows[0].session_id),
  }
  next()
}

function archiveSummary(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    building: String(row.building),
    drawGroup: row.draw_group ? String(row.draw_group) : null,
    title: String(row.title),
    notes: String(row.notes ?? ''),
    archivedBy: String(row.archived_by_name ?? 'Administrador'),
    archivedAt: new Date(String(row.archived_at)).toISOString(),
    reservationCount: Number(row.reservation_count ?? 0),
    declineCount: Number(row.decline_count ?? 0),
  }
}

async function collectBuildingSnapshot(
  client: PoolClient,
  building: Building,
  drawGroup: string,
) {
  const reservationResult = await client.query(
    `SELECT r.*, creator.username AS created_by_name,
            updater.username AS updated_by_name
       FROM apartment_reservations r
       LEFT JOIN app_users creator ON creator.id = r.created_by
       LEFT JOIN app_users updater ON updater.id = r.updated_by
      WHERE r.building = $1 AND left(trim(r.ball), 2) = $2`,
    [building, drawGroup],
  )
  const declineResult = await client.query(
    `SELECT d.*, creator.username AS created_by_name
       FROM draw_declines d
       LEFT JOIN app_users creator ON creator.id = d.created_by
      WHERE d.building = $1 AND left(trim(d.ball), 2) = $2
      ORDER BY d.created_at DESC`,
    [building, drawGroup],
  )
  const auditResult = await client.query(
    `SELECT id, storage_id, action, actor_name, reason,
            before_data, after_data, created_at
       FROM audit_events
      WHERE storage_id IN (
        SELECT storage_id
          FROM apartment_reservations
         WHERE building = $1 AND left(trim(ball), 2) = $2
      )
      ORDER BY created_at`,
    [building, drawGroup],
  )

  const assignments: Record<string, unknown> = {}
  for (const row of reservationResult.rows) {
    assignments[row.storage_id] = reservationData(row)
  }

  return {
    assignments,
    declines: declineResult.rows.map(declineData),
    auditLog: auditResult.rows.map((row) => ({
      id: row.id,
      apartmentId: row.storage_id,
      action: row.action,
      actor: row.actor_name,
      timestamp: new Date(row.created_at).toISOString(),
      reason: row.reason,
      before: row.before_data ?? undefined,
      after: row.after_data ?? undefined,
    })),
    reservationCount: reservationResult.rows.length,
    declineCount: declineResult.rows.length,
  }
}

app.get(
  '/api/anticipation-sessions/history',
  requireAnticipationAccess,
  async (req, res) => {
    const buildingValue = String(req.query.building ?? '')
    const building = BUILDINGS.includes(buildingValue as Building)
      ? (buildingValue as Building)
      : null
    const groupValue = String(req.query.group ?? '')
    const drawGroup =
      building && isDrawGroup(building, groupValue) ? groupValue : null
    if (!building) {
      res.status(400).json({ error: 'Empreendimento inválido.' })
      return
    }
    const { rows } = await pool.query(
      `SELECT s.id, s.building, s.draw_group, s.block_label, s.title,
              s.starts_at, COALESCE(s.closed_at, s.updated_at) AS closed_at,
              s.anticipator_slots,
              count(e.id)::integer AS entry_count,
              LEAST(count(e.id), s.anticipator_slots)::integer AS qualified_count
         FROM anticipation_sessions s
         LEFT JOIN anticipation_entries e ON e.session_id = s.id
        WHERE s.status = 'closed'
          AND s.building = $1
          AND s.draw_group IS NOT DISTINCT FROM $2::varchar
        GROUP BY s.id
        ORDER BY COALESCE(s.closed_at, s.updated_at) DESC`,
      [building, drawGroup],
    )
    res.json({
      sessions: rows.map((row) => ({
        id: String(row.id),
        building: String(row.building),
        drawGroup: row.draw_group ? String(row.draw_group) : null,
        blockLabel: String(row.block_label ?? ''),
        title: String(row.title),
        startsAt: new Date(String(row.starts_at)).toISOString(),
        closedAt: new Date(String(row.closed_at)).toISOString(),
        entryCount: Number(row.entry_count),
        qualifiedCount: Number(row.qualified_count),
        anticipatorSlots: Number(row.anticipator_slots),
      })),
    })
  },
)

app.get(
  '/api/anticipation-sessions/history/:id',
  requireAnticipationAccess,
  async (req, res) => {
    const { rows } = await pool.query(
      `SELECT s.*, u.username AS created_by_name
         FROM anticipation_sessions s
         LEFT JOIN app_users u ON u.id = s.created_by
        WHERE s.id = $1 AND s.status = 'closed'`,
      [req.params.id],
    )
    if (!rows[0]) {
      res.status(404).json({ error: 'Histórico não encontrado.' })
      return
    }
    res.json(await anticipationSessionData(pool, rows[0]))
  },
)

app.get(
  '/api/anticipation-sessions/current',
  requireAnticipationAccess,
  async (req, res) => {
  const buildingValue = String(req.query.building ?? '')
  const building = BUILDINGS.includes(buildingValue as Building)
    ? (buildingValue as Building)
    : null
  if (!building) {
    res.status(400).json({ error: 'Empreendimento inválido.' })
    return
  }
  const groupValue = String(req.query.group ?? '')
  const drawGroup =
    building && isDrawGroup(building, groupValue) ? groupValue : null
  await expireUnconfirmedOffers()
  const { rows } = await pool.query(
    `SELECT s.*, u.username AS created_by_name
       FROM anticipation_sessions s
       LEFT JOIN app_users u ON u.id = s.created_by
      WHERE s.building = $1
        AND s.draw_group IS NOT DISTINCT FROM $2::varchar
        AND s.status <> 'closed'
      ORDER BY CASE s.status WHEN 'active' THEN 0 ELSE 1 END, s.created_at DESC
      LIMIT 1`,
    [building, drawGroup],
  )
  res.json(rows[0] ? await anticipationSessionData(pool, rows[0]) : null)
  },
)

app.post('/api/anticipation-sessions', requireAdmin, async (req: AuthRequest, res) => {
  const buildingValue = String(req.body?.building ?? '')
  const building = BUILDINGS.includes(buildingValue as Building)
    ? (buildingValue as Building)
    : null
  const groupValue = String(req.body?.drawGroup ?? '')
  const drawGroup =
    building && isDrawGroup(building, groupValue) ? groupValue : null
  const title = String(req.body?.title ?? '').trim()
  const blockLabel = String(req.body?.blockLabel ?? '').trim().slice(0, 80)
  const liveUrl = String(req.body?.liveUrl ?? '').trim().slice(0, 400)
  const startsAt = new Date(String(req.body?.startsAt ?? ''))
  const endsAt = new Date(String(req.body?.endsAt ?? ''))
  const anticipatorSlots = normalizeSlots(req.body?.anticipatorSlots) ?? 112
  if (
    !building ||
    !title ||
    Number.isNaN(startsAt.valueOf()) ||
    Number.isNaN(endsAt.valueOf()) ||
    endsAt <= startsAt
  ) {
    res.status(400).json({
      error: 'Informe título, início e término válidos para a sessão.',
    })
    return
  }
  if (building === 'even' && !drawGroup) {
    res.status(400).json({ error: 'Selecione o grupo do Firenze.' })
    return
  }
  const id = randomUUID()
  const result = await transaction(async (client) => {
    const previous = await client.query(
      `SELECT id
         FROM anticipation_sessions
        WHERE building = $1
          AND draw_group IS NOT DISTINCT FROM $2::varchar
          AND status = 'closed'
        ORDER BY COALESCE(closed_at, updated_at) DESC
        LIMIT 1`,
      [building, drawGroup],
    )
    await client.query(
      `INSERT INTO anticipation_sessions
        (id, building, draw_group, block_label, title, starts_at, ends_at,
         live_url, anticipator_slots, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        id,
        building,
        drawGroup,
        blockLabel,
        title,
        startsAt,
        endsAt,
        liveUrl,
        anticipatorSlots,
        req.user!.id,
      ],
    )
    let carriedOverCount = 0
    if (previous.rows[0]) {
      const carried = await client.query(
        `INSERT INTO anticipation_entries
           (id, session_id, associate_code, participant, paid_installments,
            anticipated_installments, offered_installments, document_tail)
         SELECT $2 || '-' || associate_code, $2, associate_code, participant,
                paid_installments, anticipated_installments, 0, document_tail
           FROM anticipation_entries previous_entry
          WHERE previous_entry.session_id = $1
            AND NOT EXISTS (
              SELECT 1
                FROM contemplated_associates c
               WHERE c.building = $3
                 AND c.associate_code = previous_entry.associate_code
            )
            AND NOT EXISTS (
              SELECT 1
                FROM apartment_reservations r
               WHERE r.building = $3
                 AND lower(trim(r.ball)) =
                     lower(previous_entry.associate_code)
            )`,
        [
          previous.rows[0].id,
          id,
          building,
        ],
      )
      carriedOverCount = carried.rowCount ?? 0
    }
    const { rows } = await client.query(
      `SELECT s.*, u.username AS created_by_name
         FROM anticipation_sessions s
         LEFT JOIN app_users u ON u.id = s.created_by
        WHERE s.id = $1`,
      [id],
    )
    return {
      session: await anticipationSessionData(client, rows[0]),
      carriedOverCount,
    }
  })
  res.status(201).json({
    ...result.session,
    carriedOverCount: result.carriedOverCount,
  })
})

app.patch('/api/anticipation-sessions/:id', requireAdmin, async (req, res) => {
  const status = req.body?.status ? String(req.body.status) : ''
  const liveUrl =
    req.body?.liveUrl === undefined
      ? undefined
      : String(req.body.liveUrl).trim().slice(0, 400)
  const anticipatorSlots = normalizeSlots(req.body?.anticipatorSlots)
  const confirmationDeadline = normalizeConfirmationDeadline(
    req.body?.confirmationDeadline,
  )
  if (status && !['draft', 'locked', 'active', 'closed'].includes(status)) {
    res.status(400).json({ error: 'Situação da sessão inválida.' })
    return
  }
  if (req.body?.anticipatorSlots !== undefined && anticipatorSlots === undefined) {
    res.status(400).json({ error: 'Informe um número válido de vagas.' })
    return
  }
  if (
    req.body?.confirmationDeadline !== undefined &&
    confirmationDeadline === undefined
  ) {
    res.status(400).json({ error: 'Informe uma data e horário válidos.' })
    return
  }
  if (
    !status &&
    liveUrl === undefined &&
    anticipatorSlots === undefined &&
    confirmationDeadline === undefined
  ) {
    res.status(400).json({ error: 'Nenhuma alteração informada.' })
    return
  }
  const session = await transaction(async (client) => {
    const { rows } = await client.query(
      'SELECT * FROM anticipation_sessions WHERE id = $1 FOR UPDATE',
      [req.params.id],
    )
    if (!rows[0]) return null
    if (status === 'locked' && !['draft', 'active'].includes(rows[0].status)) {
      throw new ApiError(
        409,
        'Somente uma sessão aberta ou em andamento pode ser travada.',
      )
    }
    if (status === 'draft' && rows[0].status !== 'locked') {
      throw new ApiError(
        409,
        'Somente antecipações travadas podem ser reabertas.',
      )
    }
    if (status === 'active') {
      if (rows[0].status !== 'locked') {
        throw new ApiError(
          409,
          'Trave as antecipações antes de iniciar o sorteio.',
        )
      }
      const count = await client.query(
        'SELECT count(*)::integer AS total FROM anticipation_entries WHERE session_id = $1',
        [req.params.id],
      )
      if (Number(count.rows[0]?.total ?? 0) === 0) {
        throw new ApiError(
          409,
          'Inclua ao menos um associado antes de iniciar.',
        )
      }
      await client.query(
        `UPDATE anticipation_sessions
            SET status = 'closed', updated_at = now()
          WHERE building = $1
            AND draw_group IS NOT DISTINCT FROM $2::varchar
            AND status = 'active'
            AND id <> $3`,
        [rows[0].building, rows[0].draw_group, req.params.id],
      )
    }
    if (status === 'closed') {
      await client.query(
        `WITH qualified AS (
           SELECT id
             FROM anticipation_entries
            WHERE session_id = $1
            ORDER BY
              (paid_installments + anticipated_installments + offered_installments) DESC,
              associate_code::integer ASC
            LIMIT $2
         )
         UPDATE anticipation_entries e
            SET anticipated_installments =
                  CASE
                    WHEN e.offered_installments > 0 THEN e.offered_installments
                    ELSE e.anticipated_installments
                  END,
                offered_installments = 0,
                offer_status = 'confirmed'
           FROM qualified q
          WHERE e.id = q.id`,
        [req.params.id, Number(rows[0].anticipator_slots)],
      )
      await client.query(
        `INSERT INTO contemplated_associates
          (building, draw_group, associate_code, apartment_id, session_id)
         SELECT building, $2, trim(ball), apartment_id, $3
           FROM apartment_reservations
          WHERE building = $1
            AND ball ~ '^[0-9]{6}$'
            AND ($2::varchar IS NULL OR left(trim(ball), 2) = $2)
         ON CONFLICT (building, associate_code) DO UPDATE
           SET draw_group = EXCLUDED.draw_group,
               apartment_id = EXCLUDED.apartment_id,
               session_id = EXCLUDED.session_id,
               contemplated_at = now()`,
        [rows[0].building, rows[0].draw_group, req.params.id],
      )
      await client.query(
        'DELETE FROM associate_portal_sessions WHERE session_id = $1',
        [req.params.id],
      )
    }
    const updated = await client.query(
      `UPDATE anticipation_sessions
          SET status = COALESCE($2, status),
              live_url = COALESCE($3, live_url),
              anticipator_slots = COALESCE($4, anticipator_slots),
              confirmation_deadline = CASE
                WHEN $5::boolean THEN $6::timestamptz
                ELSE confirmation_deadline
              END,
              closed_at = CASE
                WHEN $2 = 'closed' THEN COALESCE(closed_at, now())
                ELSE closed_at
              END,
              updated_at = now()
        WHERE id = $1
        RETURNING *`,
      [
        req.params.id,
        status || null,
        liveUrl ?? null,
        anticipatorSlots ?? null,
        req.body?.confirmationDeadline !== undefined,
        confirmationDeadline,
      ],
    )
    await expireUnconfirmedOffers(client)
    return anticipationSessionData(client, updated.rows[0])
  })
  if (!session) {
    res.status(404).json({ error: 'Sessão não encontrada.' })
    return
  }
  res.json(session)
})

app.post(
  '/api/anticipation-sessions/:id/entries',
  requireAdmin,
  async (req, res) => {
    const associateCode = String(req.body?.associateCode ?? '').trim()
    const participant = String(req.body?.participant ?? '').trim()
    const documentTail = String(req.body?.documentTail ?? '').trim()
    const paidInstallments = Number(req.body?.paidInstallments)
    const anticipatedInstallments = Number(req.body?.anticipatedInstallments)
    const offeredInstallments = Number(req.body?.offeredInstallments)
    if (
      !/^\d{6}$/.test(associateCode) ||
      !participant ||
      !/^\d{5}$/.test(documentTail) ||
      !Number.isInteger(paidInstallments) ||
      paidInstallments < 0 ||
      !Number.isInteger(anticipatedInstallments) ||
      anticipatedInstallments < 0 ||
      anticipatedInstallments > 30 ||
      !Number.isInteger(offeredInstallments) ||
      offeredInstallments < 0 ||
      offeredInstallments > 30
    ) {
      res.status(400).json({
        error:
          'Informe contrato, 5 últimos do CPF, nome e parcelas válidas (máximo de 30).',
      })
      return
    }
    const session = await pool.query(
      'SELECT status, building FROM anticipation_sessions WHERE id = $1',
      [req.params.id],
    )
    if (!session.rows[0]) {
      res.status(404).json({ error: 'Sessão não encontrada.' })
      return
    }
    if (session.rows[0].status !== 'draft') {
      res.status(409).json({
        error:
          'As antecipações estão travadas. Reabra a preparação para alterar o ranking.',
      })
      return
    }
    const contemplated = await pool.query(
      `SELECT EXISTS (
         SELECT 1
           FROM contemplated_associates
          WHERE building = $1 AND associate_code = $2
         UNION ALL
         SELECT 1
           FROM apartment_reservations
          WHERE building = $1
            AND lower(trim(ball)) = lower($2)
       ) AS found`,
      [session.rows[0].building, associateCode],
    )
    if (contemplated.rows[0]?.found) {
      res.status(409).json({
        error: 'Este associado já foi contemplado e não pode voltar ao ranking.',
      })
      return
    }
    try {
      await pool.query(
        `INSERT INTO anticipation_entries
          (id, session_id, associate_code, participant, paid_installments,
           anticipated_installments, offered_installments, document_tail)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          randomUUID(),
          req.params.id,
          associateCode,
          participant,
          paidInstallments,
          anticipatedInstallments,
          offeredInstallments,
          documentTail,
        ],
      )
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        res.status(409).json({ error: 'Este contrato já está no ranking.' })
        return
      }
      throw error
    }
    const { rows } = await pool.query(
      `SELECT s.*, u.username AS created_by_name
         FROM anticipation_sessions s
         LEFT JOIN app_users u ON u.id = s.created_by
        WHERE s.id = $1`,
      [req.params.id],
    )
    if (!rows[0]) {
      res.status(404).json({ error: 'Sessão não encontrada.' })
      return
    }
    res.status(201).json(await anticipationSessionData(pool, rows[0]))
  },
)

app.post(
  '/api/anticipation-sessions/:id/reset',
  requireAdmin,
  async (req, res) => {
    const current = await pool.query(
      'SELECT * FROM anticipation_sessions WHERE id = $1',
      [req.params.id],
    )
    const session = current.rows[0]
    if (!session) {
      res.status(404).json({ error: 'Sessão não encontrada.' })
      return
    }
    if (session.status === 'closed' || session.status === 'active') {
      res.status(409).json({
        error:
          'Reabra a preparação antes de zerar o ranking. O sorteio em andamento e a sessão encerrada ficam de fora.',
      })
      return
    }
    await transaction(async (client) => {
      await client.query(
        `DELETE FROM anticipation_dispatches
          WHERE entry_id IN (
            SELECT id FROM anticipation_entries WHERE session_id = $1
          )`,
        [req.params.id],
      )
      await client.query(
        `UPDATE anticipation_entries
            SET offered_installments = 0,
                anticipated_installments = 0,
                offer_status = 'pending',
                offer_selected_at = NULL,
                status = 'waiting',
                apartment_id = NULL
          WHERE session_id = $1`,
        [req.params.id],
      )
    })
    const { rows } = await pool.query(
      `SELECT s.*, u.username AS created_by_name
         FROM anticipation_sessions s
         LEFT JOIN app_users u ON u.id = s.created_by
        WHERE s.id = $1`,
      [req.params.id],
    )
    res.json(await anticipationSessionData(pool, rows[0]))
  },
)

app.post(
  '/api/anticipation-sessions/:id/next',
  async (req: AuthRequest, res) => {
    if (!req.user) return
    const session = await transaction(async (client) => {
      const current = await client.query(
        `SELECT s.*, u.username AS created_by_name
           FROM anticipation_sessions s
           LEFT JOIN app_users u ON u.id = s.created_by
          WHERE s.id = $1 AND s.status = 'active'
          FOR UPDATE OF s`,
        [req.params.id],
      )
      const row = current.rows[0]
      if (!row) {
        throw new ApiError(404, 'A sessão de antecipação não está ativa.')
      }
      if (!row.awaiting_next || !row.held_storage_id) {
        throw new ApiError(
          409,
          'Confirme uma reserva antes de passar para o próximo.',
        )
      }
      if (row.next_source === 'anticipator') {
        const held = await client.query(
          `SELECT anticipation_entry_id, apartment_id
             FROM apartment_reservations
            WHERE storage_id = $1`,
          [row.held_storage_id],
        )
        const entryId = held.rows[0]?.anticipation_entry_id
        if (!entryId) {
          throw new ApiError(
            409,
            'A reserva do antecipador não foi encontrada. Desfaça e confirme de novo.',
          )
        }
        const updated = await client.query(
          `UPDATE anticipation_entries
              SET status = 'selected', apartment_id = $2
            WHERE id = $1 AND session_id = $3 AND status = 'waiting'`,
          [entryId, held.rows[0].apartment_id, req.params.id],
        )
        if (!updated.rowCount) {
          throw new ApiError(
            409,
            'O antecipador desta vez já não está aguardando.',
          )
        }
      }
      const used = await countConsumedAnticipators(client, String(req.params.id))
      const nextSource = choiceSourceAfterTurn(
        row.next_source === 'draw' ? 'draw' : 'anticipator',
        used,
        Number(row.anticipator_slots ?? 112),
      )
      const advanced = await client.query(
        `UPDATE anticipation_sessions
            SET next_source = $2,
                awaiting_next = false,
                held_storage_id = NULL,
                updated_at = now()
          WHERE id = $1
          RETURNING *`,
        [req.params.id, nextSource],
      )
      return anticipationSessionData(client, {
        ...advanced.rows[0],
        created_by_name: row.created_by_name,
      })
    })
    res.json(session)
  },
)

app.delete(
  '/api/anticipation-sessions/:sessionId/entries/:entryId',
  requireAdmin,
  async (req, res) => {
    const result = await pool.query(
      `DELETE FROM anticipation_entries
        WHERE id = $1
          AND session_id = $2
          AND status = 'waiting'
          AND EXISTS (
            SELECT 1 FROM anticipation_sessions s
             WHERE s.id = $2 AND s.status = 'draft'
          )`,
      [req.params.entryId, req.params.sessionId],
    )
    if (!result.rowCount) {
      res.status(409).json({
        error:
          'Reabra a preparação para remover um associado que ainda aguarda.',
      })
      return
    }
    res.status(204).end()
  },
)

app.get('/api/map', async (_request, response) => {
  const [
    reservationResult,
    auditResult,
    surroundingResult,
    solarIllustrationResult,
    edgeLandmarkResult,
    declineResult,
  ] = await Promise.all([
    pool.query(
      `SELECT r.*, creator.username AS created_by_name,
              updater.username AS updated_by_name
         FROM apartment_reservations r
         LEFT JOIN app_users creator ON creator.id = r.created_by
         LEFT JOIN app_users updater ON updater.id = r.updated_by`,
    ),
    pool.query(
      `SELECT id, storage_id, action, actor_name, reason,
              before_data, after_data, created_at
         FROM audit_events ORDER BY created_at`,
    ),
    pool.query(
      `SELECT building, ending, item_id, label, icon
         FROM apartment_surroundings ORDER BY building, ending, sort_order`,
    ),
    pool.query(
      `SELECT building, ending, illustration
         FROM apartment_solar_illustrations
        ORDER BY building, ending, illustration`,
    ),
    pool.query(
      `SELECT building, ending, landmark
         FROM apartment_edge_landmarks
        ORDER BY building, ending, landmark`,
    ),
    pool.query(
      `SELECT d.*, creator.username AS created_by_name
         FROM draw_declines d
         LEFT JOIN app_users creator ON creator.id = d.created_by
        ORDER BY d.created_at DESC`,
    ),
  ])

  const statuses: Record<string, string> = {}
  const assignments: Record<string, unknown> = {}
  for (const row of reservationResult.rows) {
    statuses[row.storage_id] = 'reserved'
    assignments[row.storage_id] = reservationData(row)
  }
  const auditLog = auditResult.rows.map((row) => ({
    id: row.id,
    apartmentId: row.storage_id,
    action: row.action,
    actor: row.actor_name,
    timestamp: new Date(row.created_at).toISOString(),
    reason: row.reason,
    before: row.before_data ?? undefined,
    after: row.after_data ?? undefined,
  }))
  const surroundings: Record<string, Record<string, unknown[]>> = {
    odd: {},
    even: {},
    'jardim-artes': {},
    'cond-iracema': {},
  }
  for (const row of surroundingResult.rows) {
    const ending = String(row.ending)
    surroundings[row.building][ending] ??= []
    surroundings[row.building][ending].push({
      id: row.item_id,
      label: row.label,
      icon: row.icon,
    })
  }
  const solarIllustrations: Record<string, Record<string, string[]>> = {
    odd: {},
    even: {},
    'jardim-artes': {},
    'cond-iracema': {},
  }
  for (const row of solarIllustrationResult.rows) {
    const ending = String(row.ending)
    solarIllustrations[row.building][ending] ??= []
    solarIllustrations[row.building][ending].push(row.illustration)
  }
  const edgeLandmarks: Record<string, Record<string, string[]>> = {
    odd: {},
    even: {},
    'jardim-artes': {},
    'cond-iracema': {},
  }
  for (const row of edgeLandmarkResult.rows) {
    const ending = String(row.ending)
    edgeLandmarks[row.building][ending] ??= []
    edgeLandmarks[row.building][ending].push(row.landmark)
  }
  response.json({
    statuses,
    assignments,
    auditLog,
    surroundings,
    solarIllustrations,
    edgeLandmarks,
    declines: declineResult.rows.map(declineData),
  })
})

app.put(
  '/api/reservations/:building/:apartmentId',
  async (request: AuthRequest, response) => {
    const actor = request.user
    const building = request.params.building as Building
    const apartmentId = String(request.params.apartmentId)
    if (
      !actor ||
      !BUILDINGS.includes(building) ||
      !validApartment(building, apartmentId)
    ) {
      response.status(400).json({ error: 'Apartamento inválido.' })
      return
    }
    const ball = String(request.body?.ball ?? '').trim()
    const participant = String(request.body?.participant ?? '').trim()
    const choiceSource =
      request.body?.choiceSource === 'anticipator' ? 'anticipator' : 'draw'
    const anticipationSessionId = String(
      request.body?.anticipationSessionId ?? '',
    ).trim()
    const anticipationEntryId = String(
      request.body?.anticipationEntryId ?? '',
    ).trim()
    const reason = String(request.body?.reason ?? '').trim()
    if (!ball) {
      response.status(400).json({ error: 'Informe a bolinha sorteada.' })
      return
    }
    if (!validateAssociateCode(building, ball)) {
      response.status(400).json({
        error:
          'Código de associado inválido para o grupo desta torre. Use grupo + bolinha em 4 dígitos.',
      })
      return
    }
    const declinedBall = await pool.query(
      `SELECT id FROM draw_declines
        WHERE building = $1 AND lower(ball) = lower($2)`,
      [building, ball],
    )
    if (declinedBall.rows[0]) {
      response.status(409).json({
        error:
          'Esta bolinha está na Lista de Abdicação. Remova o registro antes de reservar.',
      })
      return
    }
    const storageId = `${building}:${apartmentId}`
    try {
      const result = await transaction(async (client) => {
        const existingResult = await client.query(
          `SELECT r.*, creator.username AS created_by_name,
                  updater.username AS updated_by_name
             FROM apartment_reservations r
             LEFT JOIN app_users creator ON creator.id = r.created_by
             LEFT JOIN app_users updater ON updater.id = r.updated_by
            WHERE storage_id = $1 FOR UPDATE OF r`,
          [storageId],
        )
        const existing = existingResult.rows[0]
        if (existing && !reason) {
          throw Object.assign(new Error('Justificativa obrigatória.'), {
            status: 400,
          })
        }
        let entryId: string | null =
          existing?.anticipation_entry_id ?? null
        if (!existing) {
          const activeSession = await client.query(
            `SELECT id FROM anticipation_sessions
              WHERE building = $1
                AND status = 'active'
                AND (draw_group IS NULL OR draw_group = left($2, 2))
              ORDER BY created_at DESC
              LIMIT 1`,
            [building, ball],
          )
          if (
            activeSession.rows[0] &&
            activeSession.rows[0].id !== anticipationSessionId
          ) {
            throw new ApiError(
              409,
              'Esta escolha deve seguir a sessão de antecipação ativa.',
            )
          }
        }
        if (!existing && anticipationSessionId) {
          const sessionResult = await client.query(
            `SELECT * FROM anticipation_sessions
              WHERE id = $1 AND building = $2 AND status = 'active'
              FOR UPDATE`,
            [anticipationSessionId, building],
          )
          const session = sessionResult.rows[0]
          if (!session) {
            throw new ApiError(409, 'A sessão de antecipação não está ativa.')
          }
          if (session.awaiting_next) {
            throw new ApiError(
              409,
              'Passe para o próximo ou desfaça a reserva antes de uma nova escolha.',
            )
          }
          if (session.next_source !== choiceSource) {
            throw new ApiError(
              409,
              session.next_source === 'anticipator'
                ? 'Agora é a vez do antecipador.'
                : 'Agora é a vez do sorteio.',
            )
          }
          if (choiceSource === 'anticipator') {
            const nextResult = await client.query(
              `SELECT * FROM anticipation_entries
                WHERE session_id = $1 AND status = 'waiting'
                ORDER BY
                  (paid_installments + anticipated_installments + offered_installments) DESC,
                  associate_code::integer ASC
                LIMIT 1 FOR UPDATE`,
              [anticipationSessionId],
            )
            const nextEntry = nextResult.rows[0]
            if (
              !nextEntry ||
              nextEntry.id !== anticipationEntryId ||
              nextEntry.associate_code !== ball
            ) {
              throw new ApiError(
                409,
                'A escolha deve ser feita pelo primeiro associado do ranking.',
              )
            }
            entryId = nextEntry.id
          }
          await client.query(
            `UPDATE anticipation_sessions
                SET awaiting_next = true,
                    held_storage_id = $2,
                    updated_at = now()
              WHERE id = $1`,
            [anticipationSessionId, storageId],
          )
        }
        const before = existing ? reservationData(existing) : undefined
        const saved = existing
          ? await client.query(
              `UPDATE apartment_reservations
                  SET ball = $2, participant = $3, updated_by = $4,
                      updated_at = now(), last_justification = $5
                WHERE storage_id = $1 RETURNING *`,
              [storageId, ball, participant, actor.id, reason],
            )
          : await client.query(
              `INSERT INTO apartment_reservations
                (storage_id, building, apartment_id, ball, participant, created_by,
                 choice_source, anticipation_entry_id)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
              [
                storageId,
                building,
                apartmentId,
                ball,
                participant,
                actor.id,
                choiceSource,
                entryId,
              ],
            )
        const row = {
          ...saved.rows[0],
          created_by_name: existing?.created_by_name ?? actor.username,
          updated_by_name: existing ? actor.username : undefined,
        }
        const assignment = reservationData(row)
        const audit = await insertAudit(client, {
          storageId,
          action: existing ? 'updated' : 'created',
          actor,
          reason,
          before,
          after: assignment,
        })
        return { assignment, audit }
      })
      response.json(result)
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        response.status(409).json({ error: 'Esta bolinha já está em uso.' })
        return
      }
      const status = (error as { status?: number }).status
      if (status) {
        response.status(status).json({ error: (error as Error).message })
        return
      }
      throw error
    }
  },
)

app.delete(
  '/api/reservations/:building/:apartmentId',
  async (request: AuthRequest, response) => {
    if (!request.user) return
    const building = request.params.building as Building
    const apartmentId = String(request.params.apartmentId)
    if (!BUILDINGS.includes(building) || !validApartment(building, apartmentId)) {
      response.status(400).json({ error: 'Apartamento inválido.' })
      return
    }
    const storageId = `${building}:${apartmentId}`
    const reason = String(request.body?.reason ?? '').trim()
    if (!reason) {
      response.status(400).json({ error: 'Justificativa obrigatória.' })
      return
    }
    const audit = await transaction(async (client) => {
      const { rows } = await client.query(
        `SELECT r.*, creator.username AS created_by_name,
                updater.username AS updated_by_name
           FROM apartment_reservations r
           LEFT JOIN app_users creator ON creator.id = r.created_by
           LEFT JOIN app_users updater ON updater.id = r.updated_by
          WHERE storage_id = $1 FOR UPDATE OF r`,
        [storageId],
      )
      if (!rows[0]) {
        throw Object.assign(new Error('Reserva não encontrada.'), {
          status: 404,
        })
      }
      const before = reservationData(rows[0])
      await client.query('DELETE FROM apartment_reservations WHERE storage_id = $1', [
        storageId,
      ])
      await client.query(
        `UPDATE anticipation_sessions
            SET awaiting_next = false,
                held_storage_id = NULL,
                updated_at = now()
          WHERE held_storage_id = $1`,
        [storageId],
      )
      return insertAudit(client, {
        storageId,
        action: 'removed',
        actor: request.user!,
        reason,
        before,
      })
    })
    response.json({ audit })
  },
)

app.post(
  '/api/map/import',
  requireAdmin,
  async (request: AuthRequest, response) => {
    const actor = request.user
    if (!actor) return
    const statuses =
      request.body?.statuses && typeof request.body.statuses === 'object'
        ? (request.body.statuses as Record<string, unknown>)
        : {}
    const assignments =
      request.body?.assignments && typeof request.body.assignments === 'object'
        ? (request.body.assignments as Record<string, Record<string, unknown>>)
        : {}
    const surroundings =
      request.body?.surroundings &&
      typeof request.body.surroundings === 'object'
        ? (request.body.surroundings as Record<
            Building,
            Record<string, Array<Record<string, unknown>>>
          >)
        : null
    const solarIllustrations =
      request.body?.solarIllustrations &&
      typeof request.body.solarIllustrations === 'object'
        ? (request.body.solarIllustrations as Record<
            Building,
            Record<string, unknown>
          >)
        : null
    const edgeLandmarks =
      request.body?.edgeLandmarks &&
      typeof request.body.edgeLandmarks === 'object'
        ? (request.body.edgeLandmarks as Record<
            Building,
            Record<string, unknown>
          >)
        : null

    await transaction(async (client) => {
      await client.query('DELETE FROM apartment_reservations')
      await client.query('DELETE FROM audit_events')

      for (const [storageId, status] of Object.entries(statuses)) {
        if (status === 'none') continue
        const [building, apartmentId] = storageId.split(':') as [
          Building,
          string,
        ]
        if (
          !BUILDINGS.includes(building) ||
          !validApartment(building, apartmentId)
        ) {
          continue
        }
        const assignment = assignments[storageId] ?? {}
        const ball = String(assignment.ball ?? '').trim() || null
        const participant = String(assignment.participant ?? '').trim()
        const { rows } = await client.query(
          `INSERT INTO apartment_reservations
            (storage_id, building, apartment_id, ball, participant, created_by)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING *`,
          [storageId, building, apartmentId, ball, participant, actor.id],
        )
        await insertAudit(client, {
          storageId,
          action: 'imported',
          actor,
          reason: 'Importação administrativa',
          after: reservationData({
            ...rows[0],
            created_by_name: actor.username,
          }),
        })
      }

      if (surroundings) {
        await client.query('DELETE FROM apartment_surroundings')
        for (const building of BUILDINGS) {
          for (const [ending, items] of Object.entries(
            surroundings[building] ?? {},
          )) {
            for (const [index, item] of (items ?? []).entries()) {
              await client.query(
                `INSERT INTO apartment_surroundings
                  (building, ending, item_id, sort_order, label, icon)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [
                  building,
                  Number(ending),
                  String(item.id ?? randomUUID()),
                  index,
                  String(item.label ?? '').slice(0, 160),
                  String(item.icon ?? 'tree').slice(0, 30),
                ],
              )
            }
          }
        }
      }

      if (solarIllustrations) {
        await client.query('DELETE FROM apartment_solar_illustrations')
        for (const building of BUILDINGS) {
          for (const [ending, illustrations] of Object.entries(
            solarIllustrations[building] ?? {},
          )) {
            for (const illustration of normalizeIllustrations(illustrations)) {
              await client.query(
                `INSERT INTO apartment_solar_illustrations
                  (building, ending, illustration)
                 VALUES ($1, $2, $3)
                 ON CONFLICT DO NOTHING`,
                [building, Number(ending), illustration],
              )
            }
          }
        }
      }

      if (edgeLandmarks) {
        await client.query('DELETE FROM apartment_edge_landmarks')
        for (const building of BUILDINGS) {
          for (const [ending, landmarks] of Object.entries(
            edgeLandmarks[building] ?? {},
          )) {
            for (const landmark of normalizeLandmarks(landmarks)) {
              await client.query(
                `INSERT INTO apartment_edge_landmarks
                  (building, ending, landmark)
                 VALUES ($1, $2, $3)
                 ON CONFLICT DO NOTHING`,
                [building, Number(ending), landmark],
              )
            }
          }
        }
      }
    })
    response.json({ ok: true })
  },
)

app.put(
  '/api/surroundings/:building/:ending',
  requireAdmin,
  async (request: AuthRequest, response) => {
    const building = request.params.building as Building
    const ending = Number(request.params.ending)
    const items = Array.isArray(request.body?.items) ? request.body.items : []
    const endingLimit = BUILDING_LIMITS[building]?.endingCount
    if (
      !BUILDINGS.includes(building) ||
      !endingLimit ||
      ending < 1 ||
      ending > endingLimit
    ) {
      response.status(400).json({ error: 'Final inválido.' })
      return
    }
    await transaction(async (client) => {
      await client.query(
        'DELETE FROM apartment_surroundings WHERE building = $1 AND ending = $2',
        [building, ending],
      )
      for (const [index, item] of items.entries()) {
        await client.query(
          `INSERT INTO apartment_surroundings
            (building, ending, item_id, sort_order, label, icon)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            building,
            ending,
            String(item.id ?? randomUUID()),
            index,
            String(item.label ?? '').slice(0, 160),
            String(item.icon ?? 'tree').slice(0, 30),
          ],
        )
      }
    })
    response.json({ items })
  },
)

app.put(
  '/api/solar-illustrations/:building/:ending',
  requireAdmin,
  async (request: AuthRequest, response) => {
    const building = request.params.building as Building
    const ending = Number(request.params.ending)
    const endingLimit = BUILDING_LIMITS[building]?.endingCount
    if (
      !BUILDINGS.includes(building) ||
      !endingLimit ||
      ending < 1 ||
      ending > endingLimit
    ) {
      response.status(400).json({ error: 'Final inválido.' })
      return
    }

    const illustrations = normalizeIllustrations(request.body?.illustrations)
    await transaction(async (client) => {
      await client.query(
        'DELETE FROM apartment_solar_illustrations WHERE building = $1 AND ending = $2',
        [building, ending],
      )
      for (const illustration of illustrations) {
        await client.query(
          `INSERT INTO apartment_solar_illustrations
            (building, ending, illustration)
           VALUES ($1, $2, $3)`,
          [building, ending, illustration],
        )
      }
    })
    response.json({ illustrations })
  },
)

app.put(
  '/api/edge-landmarks/:building/:ending',
  requireAdmin,
  async (request: AuthRequest, response) => {
    const building = request.params.building as Building
    const ending = Number(request.params.ending)
    const endingLimit = BUILDING_LIMITS[building]?.endingCount
    if (
      !BUILDINGS.includes(building) ||
      !endingLimit ||
      ending < 1 ||
      ending > endingLimit
    ) {
      response.status(400).json({ error: 'Final inválido.' })
      return
    }

    const landmarks = normalizeLandmarks(request.body?.landmarks)
    await transaction(async (client) => {
      await client.query(
        'DELETE FROM apartment_edge_landmarks WHERE building = $1 AND ending = $2',
        [building, ending],
      )
      for (const landmark of landmarks) {
        await client.query(
          `INSERT INTO apartment_edge_landmarks
            (building, ending, landmark)
           VALUES ($1, $2, $3)`,
          [building, ending, landmark],
        )
      }
    })
    response.json({ landmarks })
  },
)

app.post(
  '/api/declines',
  async (request: AuthRequest, response) => {
    const actor = request.user
    const building = request.body?.building as Building
    const ball = String(request.body?.ball ?? '').trim()
    const participant = String(request.body?.participant ?? '').trim()
    const source = String(request.body?.source ?? 'draw')
    const anticipationSessionId = String(
      request.body?.anticipationSessionId ?? '',
    ).trim()
    const anticipationEntryId = String(
      request.body?.anticipationEntryId ?? '',
    ).trim()
    const reason = String(request.body?.reason ?? '')
    const notes = String(request.body?.notes ?? '').trim().slice(0, 240)
    if (!actor || !BUILDINGS.includes(building) || !ball) {
      response.status(400).json({ error: 'Informe a bolinha sorteada.' })
      return
    }
    if (!validateAssociateCode(building, ball)) {
      response.status(400).json({
        error:
          'Código de associado inválido para o grupo desta torre. Use grupo + bolinha em 4 dígitos.',
      })
      return
    }
    if (!DECLINE_REASONS.includes(reason as (typeof DECLINE_REASONS)[number])) {
      response.status(400).json({ error: 'Selecione o motivo.' })
      return
    }
    if (!DECLINE_SOURCES.includes(source as (typeof DECLINE_SOURCES)[number])) {
      response.status(400).json({ error: 'Selecione a origem da abdicação.' })
      return
    }
    const reserved = await pool.query(
      `SELECT apartment_id FROM apartment_reservations
        WHERE building = $1 AND lower(ball) = lower($2)`,
      [building, ball],
    )
    if (reserved.rows[0]) {
      response.status(409).json({
        error: `Esta bolinha já está reservada no apartamento ${reserved.rows[0].apartment_id}.`,
      })
      return
    }
    try {
      const result = await transaction(async (client) => {
        const activeSession = await client.query(
          `SELECT id FROM anticipation_sessions
            WHERE building = $1
              AND status = 'active'
              AND (draw_group IS NULL OR draw_group = left($2, 2))
            ORDER BY created_at DESC
            LIMIT 1`,
          [building, ball],
        )
        if (
          activeSession.rows[0] &&
          activeSession.rows[0].id !== anticipationSessionId
        ) {
          throw new ApiError(
            409,
            'Esta abdicação deve seguir a sessão de antecipação ativa.',
          )
        }
        if (anticipationSessionId) {
          const sessionResult = await client.query(
            `SELECT * FROM anticipation_sessions
              WHERE id = $1 AND building = $2 AND status = 'active'
              FOR UPDATE`,
            [anticipationSessionId, building],
          )
          const session = sessionResult.rows[0]
          if (!session) {
            throw new ApiError(409, 'A sessão de antecipação não está ativa.')
          }
          if (session.awaiting_next) {
            throw new ApiError(
              409,
              'Desfaça a reserva ou passe para o próximo antes de abdicar.',
            )
          }
          if (session.next_source !== source) {
            throw new ApiError(
              409,
              session.next_source === 'anticipator'
                ? 'Agora é a vez do antecipador.'
                : 'Agora é a vez do sorteio.',
            )
          }
          if (source === 'anticipator') {
            const nextResult = await client.query(
              `SELECT * FROM anticipation_entries
                WHERE session_id = $1 AND status = 'waiting'
                ORDER BY
                  (paid_installments + anticipated_installments + offered_installments) DESC,
                  associate_code::integer ASC
                LIMIT 1 FOR UPDATE`,
              [anticipationSessionId],
            )
            const nextEntry = nextResult.rows[0]
            if (
              !nextEntry ||
              nextEntry.id !== anticipationEntryId ||
              nextEntry.associate_code !== ball
            ) {
              throw new ApiError(
                409,
                'A abdicação deve ser feita pelo primeiro associado do ranking.',
              )
            }
            await client.query(
              `UPDATE anticipation_entries
                  SET status = 'declined'
                WHERE id = $1`,
              [nextEntry.id],
            )
            const used = await countConsumedAnticipators(
              client,
              anticipationSessionId,
            )
            const nextSource = choiceSourceAfterTurn(
              session.next_source === 'draw' ? 'draw' : 'anticipator',
              used,
              Number(session.anticipator_slots ?? 112),
              true,
            )
            if (nextSource !== session.next_source) {
              await client.query(
                `UPDATE anticipation_sessions
                    SET next_source = $2, updated_at = now()
                  WHERE id = $1`,
                [session.id, nextSource],
              )
            }
          }
          // Antes de esgotar as vagas, abdicar mantém a mesma vez.
          // A 112ª chamada, contando abdicação, passa a vez só para o sorteio.
        }
        const { rows } = await client.query(
          `INSERT INTO draw_declines
            (id, building, ball, participant, source, reason, notes, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING *, $9::text AS created_by_name`,
          [
            randomUUID(),
            building,
            ball,
            participant,
            source,
            reason,
            notes,
            actor.id,
            actor.username,
          ],
        )
        return declineData(rows[0])
      })
      response.status(201).json(result)
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        response.status(409).json({
          error: 'Esta bolinha já está na Lista de Abdicação.',
        })
        return
      }
      throw error
    }
  },
)

app.delete(
  '/api/declines/:id',
  async (request: AuthRequest, response) => {
    const { rowCount } = await pool.query(
      'DELETE FROM draw_declines WHERE id = $1',
      [request.params.id],
    )
    if (!rowCount) {
      response.status(404).json({ error: 'Registro não encontrado.' })
      return
    }
    response.status(204).end()
  },
)

app.get(
  '/api/draw-archives',
  requireAdmin,
  async (_request: AuthRequest, response) => {
    const { rows } = await pool.query(
      `SELECT a.*, u.username AS archived_by_name
         FROM draw_archives a
         LEFT JOIN app_users u ON u.id = a.archived_by
        ORDER BY a.archived_at DESC`,
    )
    response.json({ archives: rows.map(archiveSummary) })
  },
)

app.get(
  '/api/draw-archives/:id',
  requireAdmin,
  async (request: AuthRequest, response) => {
    const { rows } = await pool.query(
      `SELECT a.*, u.username AS archived_by_name
         FROM draw_archives a
         LEFT JOIN app_users u ON u.id = a.archived_by
        WHERE a.id = $1`,
      [request.params.id],
    )
    if (!rows[0]) {
      response.status(404).json({ error: 'Histórico não encontrado.' })
      return
    }
    response.json({
      ...archiveSummary(rows[0]),
      snapshot: rows[0].snapshot,
    })
  },
)

app.post(
  '/api/draw-archives/close',
  requireAdmin,
  async (request: AuthRequest, response) => {
    const actor = request.user
    const building = request.body?.building as Building
    const notes = String(request.body?.notes ?? '').trim().slice(0, 240)
    const requestedGroup = request.body?.drawGroup
      ? String(request.body.drawGroup)
      : null
    if (!actor || !BUILDINGS.includes(building)) {
      response.status(400).json({ error: 'Empreendimento inválido.' })
      return
    }
    if (!isDrawGroup(building, requestedGroup)) {
      response.status(400).json({
        error: 'Selecione o grupo que está sendo encerrado.',
      })
      return
    }
    const drawGroup = requestedGroup
    const buildingLabel = BUILDING_CONFIGS[building].label
    const title = drawGroup ? `${buildingLabel} · G${drawGroup}` : buildingLabel

    const archived = await transaction(async (client) => {
      const snapshot = await collectBuildingSnapshot(
        client,
        building,
        drawGroup,
      )
      const id = randomUUID()
      const { rows } = await client.query(
        `INSERT INTO draw_archives
          (id, building, draw_group, title, notes,
           reservation_count, decline_count, snapshot, archived_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *, $10::text AS archived_by_name`,
        [
          id,
          building,
          drawGroup,
          title,
          notes,
          snapshot.reservationCount,
          snapshot.declineCount,
          JSON.stringify({
            assignments: snapshot.assignments,
            declines: snapshot.declines,
            auditLog: snapshot.auditLog,
          }),
          actor.id,
          actor.username,
        ],
      )
      await client.query(
        `INSERT INTO contemplated_associates
          (building, draw_group, associate_code, apartment_id)
         SELECT building, $2::varchar, trim(ball), apartment_id
           FROM apartment_reservations
          WHERE building = $1
            AND ball ~ '^[0-9]{6}$'
            AND left(trim(ball), 2) = $2::text
         ON CONFLICT (building, associate_code) DO UPDATE
           SET draw_group = EXCLUDED.draw_group,
               apartment_id = EXCLUDED.apartment_id,
               contemplated_at = now()`,
        [building, drawGroup],
      )
      const closedSessions = await client.query(
        `UPDATE anticipation_sessions
            SET status = 'closed',
                closed_at = COALESCE(closed_at, now()),
                updated_at = now()
          WHERE building = $1
            AND draw_group = $2
            AND status <> 'closed'
        RETURNING id`,
        [building, drawGroup],
      )
      if (closedSessions.rows.length) {
        await client.query(
          `DELETE FROM associate_portal_sessions
            WHERE session_id = ANY($1::text[])`,
          [closedSessions.rows.map((session) => session.id)],
        )
      }
      await client.query(
        `DELETE FROM audit_events
          WHERE storage_id IN (
            SELECT storage_id
              FROM apartment_reservations
             WHERE building = $1 AND left(trim(ball), 2) = $2
          )`,
        [building, drawGroup],
      )
      await client.query(
        `DELETE FROM apartment_reservations
          WHERE building = $1 AND left(trim(ball), 2) = $2`,
        [building, drawGroup],
      )
      await client.query(
        `DELETE FROM draw_declines
          WHERE building = $1 AND left(trim(ball), 2) = $2`,
        [building, drawGroup],
      )
      return archiveSummary(rows[0])
    })
    response.status(201).json(archived)
  },
)

const ISSUE_KINDS = ['falha', 'melhoria'] as const
const ISSUE_PRIORITIES = ['baixa', 'media', 'alta'] as const
const ISSUE_STAGES = ['backlog', 'doing', 'done'] as const

const issueData = (row: Record<string, unknown>) => ({
  id: String(row.id),
  number: Number(row.issue_number),
  title: String(row.title),
  kind: String(row.kind),
  priority: String(row.priority),
  stage: String(row.stage),
  context: String(row.context),
  expected: String(row.expected ?? ''),
  place: String(row.place ?? ''),
  authorName: String(row.author_name),
  createdAt: new Date(String(row.created_at)).toISOString(),
  updatedAt: new Date(String(row.updated_at)).toISOString(),
})

app.get('/api/issues', requireAdmin, async (_request, response) => {
  const { rows } = await pool.query(
    `SELECT id, issue_number, title, kind, priority, stage, context, expected,
            place, author_name, created_at, updated_at
       FROM product_issues
      ORDER BY created_at DESC`,
  )
  response.json(rows.map(issueData))
})

app.post('/api/issues', async (request: AuthRequest, response) => {
  const title = String(request.body?.title ?? '').trim()
  const context = String(request.body?.context ?? '').trim()
  const expected = String(request.body?.expected ?? '').trim()
  const place = String(request.body?.place ?? '').trim().slice(0, 160)
  const kind = String(request.body?.kind ?? '')
  const priority = String(request.body?.priority ?? '')
  if (
    title.length < 4 ||
    title.length > 180 ||
    context.length < 8 ||
    context.length > 2000 ||
    expected.length > 2000 ||
    !ISSUE_KINDS.includes(kind as (typeof ISSUE_KINDS)[number]) ||
    !ISSUE_PRIORITIES.includes(priority as (typeof ISSUE_PRIORITIES)[number])
  ) {
    response.status(400).json({
      error: 'Informe título, tipo, prioridade e o que aconteceu.',
    })
    return
  }
  const { rows } = await pool.query(
    `INSERT INTO product_issues
      (id, title, kind, priority, context, expected, place, author_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, issue_number, title, kind, priority, stage, context,
               expected, place, author_name, created_at, updated_at`,
    [
      randomUUID(),
      title,
      kind,
      priority,
      context,
      expected,
      place,
      request.user?.username ?? 'Equipe',
    ],
  )
  response.status(201).json(issueData(rows[0]))
})

app.patch('/api/issues/:id', requireAdmin, async (request, response) => {
  const id = String(request.params.id)
  const stage = request.body?.stage
  const priority = request.body?.priority
  const kind = request.body?.kind
  if (
    (stage !== undefined &&
      !ISSUE_STAGES.includes(stage as (typeof ISSUE_STAGES)[number])) ||
    (priority !== undefined &&
      !ISSUE_PRIORITIES.includes(
        priority as (typeof ISSUE_PRIORITIES)[number],
      )) ||
    (kind !== undefined &&
      !ISSUE_KINDS.includes(kind as (typeof ISSUE_KINDS)[number])) ||
    (stage === undefined && priority === undefined && kind === undefined)
  ) {
    response.status(400).json({ error: 'Atualização inválida.' })
    return
  }
  const { rows } = await pool.query(
    `UPDATE product_issues
        SET stage = COALESCE($2, stage),
            priority = COALESCE($3, priority),
            kind = COALESCE($4, kind),
            updated_at = now()
      WHERE id = $1
      RETURNING id, issue_number, title, kind, priority, stage, context,
                expected, place, author_name, created_at, updated_at`,
    [id, stage ?? null, priority ?? null, kind ?? null],
  )
  if (!rows[0]) {
    response.status(404).json({ error: 'Item não encontrado.' })
    return
  }
  response.json(issueData(rows[0]))
})

registerCobrancaRoutes(app)

app.use(
  '/api',
  (
    error: Error,
    _request: Request,
    response: Response,
    _next: NextFunction,
  ) => {
    void _next
    console.error(error)
    const status = (error as Error & { status?: number }).status ?? 500
    response.status(status).json({
      error: status === 500 ? 'Erro interno do servidor.' : error.message,
    })
  },
)

const currentDirectory = path.dirname(fileURLToPath(import.meta.url))
const distDirectory = path.resolve(currentDirectory, '..', 'dist')
app.use(express.static(distDirectory))
app.use((_request, response) => {
  response.sendFile(path.join(distDirectory, 'index.html'))
})

app.listen(port, '127.0.0.1', () => {
  startCollectionAgent()
  void expireUnconfirmedOffers().catch(() => undefined)
  setInterval(() => {
    void expireUnconfirmedOffers().catch(() => undefined)
  }, 30_000)
  console.log(`Evo Coop Live disponível em http://127.0.0.1:${port}`)
})
