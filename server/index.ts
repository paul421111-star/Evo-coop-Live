import 'dotenv/config'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
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
import { pool, transaction } from './db'

type SessionUser = {
  id: string
  username: string
  role: 'admin' | 'operator'
}

type AuthRequest = Request & { user?: SessionUser }
type Building = 'odd' | 'even' | 'jardim-artes' | 'cond-iracema'

const BUILDINGS: Building[] = [
  'odd',
  'even',
  'jardim-artes',
  'cond-iracema',
]
const SOLAR_ILLUSTRATIONS = ['sunrise', 'sunset'] as const
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
const port = Number(process.env.PORT ?? 3015)

app.use(helmet({ contentSecurityPolicy: false }))
app.use(express.json({ limit: '2mb' }))
app.use(cookieParser())

const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex')

const reservationData = (row: Record<string, unknown>) => ({
  ball: String(row.ball ?? ''),
  participant: String(row.participant ?? ''),
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

app.use('/api', authenticateRequest)

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
        role: 'operator' as const,
        createdAt: new Date().toISOString(),
      }
      await pool.query(
        `INSERT INTO app_users (id, username, password_hash, role)
         VALUES ($1, $2, $3, 'operator')`,
        [user.id, username, await bcrypt.hash(password, 12)],
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
    await pool.query(`DELETE FROM app_users WHERE id = $1 AND role = 'operator'`, [
      request.params.id,
    ])
    response.status(204).end()
  },
)

const DECLINE_REASONS = ['refused', 'next-tower', 'no-answer'] as const

function declineData(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    building: String(row.building),
    ball: String(row.ball ?? ''),
    participant: String(row.participant ?? ''),
    reason: String(row.reason),
    notes: String(row.notes ?? ''),
    createdBy: String(row.created_by_name ?? 'Registro anterior'),
    createdAt: new Date(String(row.created_at)).toISOString(),
  }
}

app.get('/api/map', async (_request, response) => {
  const [
    reservationResult,
    auditResult,
    surroundingResult,
    solarIllustrationResult,
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
         FROM apartment_solar_illustrations ORDER BY building, ending`,
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
  const solarIllustrations: Record<string, Record<string, string>> = {
    odd: {},
    even: {},
    'jardim-artes': {},
    'cond-iracema': {},
  }
  for (const row of solarIllustrationResult.rows) {
    solarIllustrations[row.building][String(row.ending)] = row.illustration
  }
  response.json({
    statuses,
    assignments,
    auditLog,
    surroundings,
    solarIllustrations,
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
    const reason = String(request.body?.reason ?? '').trim()
    if (!ball) {
      response.status(400).json({ error: 'Informe a bolinha sorteada.' })
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
          'Esta bolinha está na lista de quem não aceitou o sorteio. Remova o registro antes de reservar.',
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
                (storage_id, building, apartment_id, ball, participant, created_by)
               VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
              [
                storageId,
                building,
                apartmentId,
                ball,
                participant,
                actor.id,
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
          for (const [ending, illustration] of Object.entries(
            solarIllustrations[building] ?? {},
          )) {
            if (
              !SOLAR_ILLUSTRATIONS.includes(
                illustration as (typeof SOLAR_ILLUSTRATIONS)[number],
              )
            ) {
              continue
            }
            await client.query(
              `INSERT INTO apartment_solar_illustrations
                (building, ending, illustration)
               VALUES ($1, $2, $3)`,
              [building, Number(ending), illustration],
            )
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
    const illustration = request.body?.illustration
    const endingLimit = BUILDING_LIMITS[building]?.endingCount
    if (
      !BUILDINGS.includes(building) ||
      !endingLimit ||
      ending < 1 ||
      ending > endingLimit ||
      (illustration !== null &&
        !SOLAR_ILLUSTRATIONS.includes(
          illustration as (typeof SOLAR_ILLUSTRATIONS)[number],
        ))
    ) {
      response.status(400).json({ error: 'Ilustração solar inválida.' })
      return
    }
    if (illustration === null) {
      await pool.query(
        'DELETE FROM apartment_solar_illustrations WHERE building = $1 AND ending = $2',
        [building, ending],
      )
    } else {
      await pool.query(
        `INSERT INTO apartment_solar_illustrations
          (building, ending, illustration)
         VALUES ($1, $2, $3)
         ON CONFLICT (building, ending)
         DO UPDATE SET illustration = EXCLUDED.illustration`,
        [building, ending, illustration],
      )
    }
    response.json({ illustration })
  },
)

app.post(
  '/api/declines',
  async (request: AuthRequest, response) => {
    const actor = request.user
    const building = request.body?.building as Building
    const ball = String(request.body?.ball ?? '').trim()
    const participant = String(request.body?.participant ?? '').trim()
    const reason = String(request.body?.reason ?? '')
    const notes = String(request.body?.notes ?? '').trim().slice(0, 240)
    if (!actor || !BUILDINGS.includes(building) || !ball) {
      response.status(400).json({ error: 'Informe a bolinha sorteada.' })
      return
    }
    if (!DECLINE_REASONS.includes(reason as (typeof DECLINE_REASONS)[number])) {
      response.status(400).json({ error: 'Selecione o motivo.' })
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
      const { rows } = await pool.query(
        `INSERT INTO draw_declines
          (id, building, ball, participant, reason, notes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *, $8::text AS created_by_name`,
        [
          randomUUID(),
          building,
          ball,
          participant,
          reason,
          notes,
          actor.id,
          actor.username,
        ],
      )
      response.status(201).json(declineData(rows[0]))
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        response.status(409).json({
          error: 'Esta bolinha já está na lista de quem não aceitou.',
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
  console.log(`Evo Coop Live disponível em http://127.0.0.1:${port}`)
})
