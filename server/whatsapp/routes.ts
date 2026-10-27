import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import { ZipArchive } from 'archiver'
import type { Express, NextFunction, Request, Response } from 'express'
import rateLimit from 'express-rate-limit'
import twilio from 'twilio'
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
  user?: {
    id: string
    role: 'admin' | 'operator_sede' | 'operator_obra' | 'live'
  }
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

function twilioVoiceConfig() {
  return {
    accountSid: String(process.env.TWILIO_ACCOUNT_SID ?? '').trim(),
    authToken: String(process.env.TWILIO_AUTH_TOKEN ?? '').trim(),
    apiKeySid: String(process.env.TWILIO_API_KEY_SID ?? '').trim(),
    apiKeySecret: String(process.env.TWILIO_API_KEY_SECRET ?? '').trim(),
    twimlAppSid: String(process.env.TWILIO_TWIML_APP_SID ?? '').trim(),
    phoneNumber: String(process.env.TWILIO_PHONE_NUMBER ?? '').trim(),
    webhookBaseUrl: String(process.env.TWILIO_WEBHOOK_BASE_URL ?? '')
      .trim()
      .replace(/\/+$/, ''),
  }
}

function hasTwilioVoiceConfig(
  config: ReturnType<typeof twilioVoiceConfig>,
) {
  return Boolean(
    config.accountSid &&
      config.authToken &&
      /^\+\d{8,15}$/.test(config.phoneNumber),
  )
}

function hasTwilioBrowserConfig(
  config: ReturnType<typeof twilioVoiceConfig>,
) {
  return Boolean(
    config.accountSid &&
      config.authToken &&
      config.apiKeySid &&
      config.apiKeySecret &&
      /^AP[0-9a-f]{32}$/i.test(config.twimlAppSid),
  )
}

async function twilioOwnsPhoneNumber(
  config: ReturnType<typeof twilioVoiceConfig>,
) {
  const auth = Buffer.from(`${config.accountSid}:${config.authToken}`).toString(
    'base64',
  )
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/IncomingPhoneNumbers.json?PageSize=1`,
    { headers: { Authorization: `Basic ${auth}` } },
  )
  if (!response.ok) return false
  const body = (await response.json()) as {
    incoming_phone_numbers?: unknown[]
  }
  return (body.incoming_phone_numbers?.length ?? 0) > 0
}

function twilioAuthorization(config: ReturnType<typeof twilioVoiceConfig>) {
  return Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64')
}

async function twilioRecordingForCall(
  config: ReturnType<typeof twilioVoiceConfig>,
  callSid: string,
) {
  const headers = { Authorization: `Basic ${twilioAuthorization(config)}` }
  const callSids = [callSid]
  const children = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Calls.json?ParentCallSid=${callSid}&PageSize=20`,
    { headers },
  )
  if (children.ok) {
    const body = (await children.json()) as { calls?: Array<{ sid?: string }> }
    for (const call of body.calls ?? []) {
      if (call.sid) callSids.push(call.sid)
    }
  }
  for (const sid of callSids) {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Recordings.json?CallSid=${sid}&PageSize=5`,
      { headers },
    )
    if (!response.ok) continue
    const body = (await response.json()) as {
      recordings?: Array<{ sid?: string; duration?: string }>
    }
    const recording = body.recordings?.find((item) => item.sid)
    if (recording?.sid) {
      return {
        recordingSid: recording.sid,
        durationSeconds: Number(recording.duration ?? 0),
      }
    }
  }
  return null
}

function recordingRow(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    associateCode: String(row.associate_code),
    phone: String(row.phone),
    callSid: String(row.call_sid),
    recordingSid: row.recording_sid ? String(row.recording_sid) : '',
    durationSeconds: Number(row.duration_seconds ?? 0),
    createdAt: new Date(String(row.created_at)).toISOString(),
  }
}

/**
 * A Twilio chama este endpoint sem a sessão do sistema. A assinatura garante
 * que o pedido veio da Twilio e o número precisa existir nos dados da cobrança.
 */
export function registerTwilioVoiceWebhook(app: Express) {
  app.post(
    '/api/public/cobranca/voice/twiml',
    async (request, response) => {
      const config = twilioVoiceConfig()
      const voiceResponse = new twilio.twiml.VoiceResponse()
      const webhookUrl = `${config.webhookBaseUrl}/api/public/cobranca/voice/twiml`
      const signature = String(request.header('x-twilio-signature') ?? '')
      const params = Object.fromEntries(
        Object.entries(request.body ?? {}).map(([key, value]) => [
          key,
          String(value ?? ''),
        ]),
      )

      if (
        !hasTwilioVoiceConfig(config) ||
        !signature ||
        !twilio.validateRequest(
          config.authToken,
          signature,
          webhookUrl,
          params,
        )
      ) {
        response.status(403).type('text/xml').send(voiceResponse.toString())
        return
      }

      const phone = normalizeBrazilPhone(String(request.body?.To ?? ''))
      if (!phone) {
        voiceResponse.say(
          { language: 'pt-BR' },
          'O número informado é inválido.',
        )
        response.type('text/xml').send(voiceResponse.toString())
        return
      }

      const knownPhone = await pool.query(
        `SELECT 1
           FROM anticipation_entries
          WHERE regexp_replace(coalesce(whatsapp_phone, ''), '[^0-9]', '', 'g')
                IN ($1, right($1, 11))
         UNION ALL
         SELECT 1
           FROM whatsapp_contacts
          WHERE regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g')
                IN ($1, right($1, 11))
         UNION ALL
         SELECT 1
           FROM whatsapp_conversations
          WHERE regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g')
                IN ($1, right($1, 11))
         LIMIT 1`,
        [phone],
      )
      if (!knownPhone.rowCount) {
        voiceResponse.say(
          { language: 'pt-BR' },
          'Este número não está cadastrado no sistema.',
        )
        response.type('text/xml').send(voiceResponse.toString())
        return
      }

      const dial = voiceResponse.dial({
        answerOnBridge: true,
        callerId: config.phoneNumber,
      })
      dial.number(`+${phone}`)
      response.type('text/xml').send(voiceResponse.toString())
    },
  )
}

export function registerCobrancaRoutes(app: Express) {
  app.get(
    '/api/cobranca/voice/status',
    requireCollections,
    async (_request, response) => {
      const config = twilioVoiceConfig()
      const browser = hasTwilioBrowserConfig(config)
      const hasNumber = browser ? await twilioOwnsPhoneNumber(config) : false
      const settings = await pool.query(
        `SELECT record_calls FROM collection_agent_settings WHERE id = true`,
      )
      response.json({
        configured: browser && hasNumber,
        hint:
          browser && !hasNumber
            ? 'Conclua a validação de identidade na Twilio e compre um número com voz. O headset deste computador liga por esse número.'
            : '',
        recordCalls: settings.rows[0]?.record_calls !== false,
      })
    },
  )

  app.get(
    '/api/cobranca/voice/phones',
    requireCollections,
    async (_request, response) => {
      const { rows } = await pool.query(
        `SELECT id, name, phone FROM collection_call_phones ORDER BY created_at`,
      )
      response.json(
        rows.map((row) => ({
          id: String(row.id),
          name: String(row.name),
          phone: String(row.phone),
        })),
      )
    },
  )

  app.post(
    '/api/cobranca/voice/phones',
    requireCollections,
    async (request, response) => {
      const name = String(request.body?.name ?? '').trim()
      const phone = normalizeBrazilPhone(String(request.body?.phone ?? ''))
      if (name.length < 2 || name.length > 120 || !phone) {
        response.status(400).json({
          error: 'Informe o nome de quem atende e um celular válido.',
        })
        return
      }
      const count = await pool.query(
        `SELECT count(*)::integer AS total FROM collection_call_phones`,
      )
      if (Number(count.rows[0]?.total ?? 0) >= 2) {
        response.status(409).json({
          error: 'Já existem dois celulares. Remova um para cadastrar outro.',
        })
        return
      }
      try {
        const { rows } = await pool.query(
          `INSERT INTO collection_call_phones (id, name, phone)
           VALUES ($1, $2, $3)
           RETURNING id, name, phone`,
          [randomUUID(), name, phone],
        )
        response.status(201).json({
          id: String(rows[0].id),
          name: String(rows[0].name),
          phone: String(rows[0].phone),
        })
      } catch (error) {
        if ((error as { code?: string }).code === '23505') {
          response.status(409).json({ error: 'Esse celular já está cadastrado.' })
          return
        }
        throw error
      }
    },
  )

  app.delete(
    '/api/cobranca/voice/phones/:id',
    requireCollections,
    async (request, response) => {
      await pool.query(`DELETE FROM collection_call_phones WHERE id = $1`, [
        String(request.params.id),
      ])
      response.status(204).end()
    },
  )

  app.get(
    '/api/cobranca/voice/contacts',
    requireCollections,
    async (request, response) => {
      const building = String(request.query.building ?? '')
      const group = String(request.query.group ?? '')
      const search = String(request.query.q ?? '').trim()
      if (!building) {
        response.status(400).json({ error: 'Informe o condomínio do evento.' })
        return
      }
      const { rows } = await pool.query(
        `SELECT DISTINCT ON (e.associate_code)
                e.id, e.associate_code, e.participant,
                coalesce(ap.phone, e.whatsapp_phone) AS phone
           FROM anticipation_entries e
           JOIN anticipation_sessions s ON s.id = e.session_id
           LEFT JOIN associate_phones ap
             ON ap.building = s.building
            AND ap.associate_code = e.associate_code
          WHERE s.building = $1
            AND ($2 = '' OR s.draw_group = $2)
            AND s.status <> 'closed'
            AND ($3 = ''
                 OR e.associate_code LIKE '%' || $3 || '%'
                 OR e.participant ILIKE '%' || $3 || '%'
                 OR ($4 <> '' AND coalesce(ap.phone, e.whatsapp_phone, '') LIKE '%' || $4 || '%'))
          ORDER BY e.associate_code, s.created_at DESC
          LIMIT 1000`,
        [building, group, search, search.replace(/\D/g, '')],
      )
      response.json(
        rows.map((row) => ({
          id: String(row.id),
          associateCode: String(row.associate_code),
          participant: String(row.participant ?? ''),
          phone: row.phone ? String(row.phone) : '',
        })),
      )
    },
  )

  app.patch(
    '/api/cobranca/voice/contacts/:code/phone',
    requireCollections,
    async (request, response) => {
      const building = String(request.query.building ?? '')
      const associateCode = String(request.params.code ?? '')
      const raw = String(request.body?.phone ?? '')
      const phone = raw.trim() === '' ? null : normalizeBrazilPhone(raw)
      if (!building || !/^\d{6}$/.test(associateCode)) {
        response.status(400).json({ error: 'Informe o contrato de 6 dígitos.' })
        return
      }
      if (raw.trim() && !phone) {
        response.status(400).json({ error: 'Informe um celular válido.' })
        return
      }
      const known = await pool.query(
        `SELECT 1
           FROM anticipation_entries e
           JOIN anticipation_sessions s ON s.id = e.session_id
          WHERE s.building = $1
            AND e.associate_code = $2
          LIMIT 1`,
        [building, associateCode],
      )
      if (!known.rowCount) {
        response.status(404).json({ error: 'Contrato não encontrado.' })
        return
      }
      await pool.query(
        `INSERT INTO associate_phones (building, associate_code, phone)
         VALUES ($1, $2, $3)
         ON CONFLICT (building, associate_code)
         DO UPDATE SET phone = EXCLUDED.phone, updated_at = now()`,
        [building, associateCode, phone],
      )
      await pool.query(
        `UPDATE anticipation_entries e
            SET whatsapp_phone = $3
           FROM anticipation_sessions s
          WHERE e.session_id = s.id
            AND s.building = $1
            AND s.status <> 'closed'
            AND e.associate_code = $2`,
        [building, associateCode, phone],
      )
      response.json({ associateCode, phone: phone ?? '' })
    },
  )

  app.post(
    '/api/cobranca/voice/call',
    requireCollections,
    rateLimit({ windowMs: 60_000, limit: 8 }),
    async (request, response) => {
      const config = twilioVoiceConfig()
      const destination = normalizeBrazilPhone(String(request.body?.phone ?? ''))
      if (!hasTwilioVoiceConfig(config)) {
        response.status(503).json({
          error: 'As ligações ainda não foram configuradas pela administração.',
        })
        return
      }
      const team = await pool.query(
        `SELECT phone FROM collection_call_phones WHERE id = $1`,
        [String(request.body?.agentPhoneId ?? '')],
      )
      const agentPhone = team.rows[0]?.phone
        ? String(team.rows[0].phone)
        : null
      if (!agentPhone) {
        response.status(400).json({
          error: 'Escolha um celular da equipe para atender a ligação.',
        })
        return
      }
      if (!destination) {
        response.status(400).json({
          error: 'Este contato não tem um telefone válido.',
        })
        return
      }
      if (destination === agentPhone) {
        response.status(400).json({
          error: 'O celular da equipe precisa ser diferente do número do contato.',
        })
        return
      }

      const knownPhone = await pool.query(
        `SELECT 1
           FROM anticipation_entries
          WHERE regexp_replace(coalesce(whatsapp_phone, ''), '[^0-9]', '', 'g')
                IN ($1, right($1, 11))
         UNION ALL
         SELECT 1
           FROM whatsapp_contacts
          WHERE regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g')
                IN ($1, right($1, 11))
         UNION ALL
         SELECT 1
           FROM whatsapp_conversations
          WHERE regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g')
                IN ($1, right($1, 11))
         LIMIT 1`,
        [destination],
      )
      if (!knownPhone.rowCount) {
        response.status(404).json({
          error: 'Esse número não está em uma conversa ou no cadastro.',
        })
        return
      }

      const twiml =
        `<Response><Dial callerId="${config.phoneNumber}">` +
        `<Number>+${destination}</Number></Dial></Response>`
      const auth = Buffer.from(
        `${config.accountSid}:${config.authToken}`,
      ).toString('base64')
      const twilioResponse = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Calls.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            To: `+${agentPhone}`,
            From: config.phoneNumber,
            Url: `https://twimlets.com/echo?Twiml=${encodeURIComponent(twiml)}`,
          }),
        },
      )
      const body = (await twilioResponse.json()) as {
        sid?: string
        message?: string
      }
      if (!twilioResponse.ok) {
        response.status(409).json({
          error: body.message ?? 'A Twilio não conseguiu iniciar a ligação.',
        })
        return
      }
      response.status(201).json({ callSid: body.sid ?? '' })
    },
  )

  app.get(
    '/api/cobranca/voice/calls/:sid',
    requireCollections,
    async (request, response) => {
      const callSid = String(request.params.sid)
      const config = twilioVoiceConfig()
      if (!hasTwilioVoiceConfig(config) || !/^CA[0-9a-f]{32}$/i.test(callSid)) {
        response.status(404).json({ error: 'Ligação não encontrada.' })
        return
      }
      const auth = Buffer.from(
        `${config.accountSid}:${config.authToken}`,
      ).toString('base64')
      const twilioResponse = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Calls/${callSid}.json`,
        { headers: { Authorization: `Basic ${auth}` } },
      )
      const body = (await twilioResponse.json()) as {
        status?: string
        to?: string
        duration?: string
        message?: string
      }
      if (!twilioResponse.ok) {
        response.status(409).json({
          error: body.message ?? 'Não foi possível consultar a ligação.',
        })
        return
      }
      response.json({
        status: body.status ?? 'failed',
        to: body.to ?? '',
        duration: Number(body.duration ?? 0),
      })
    },
  )

  app.post(
    '/api/cobranca/voice/token',
    requireCollections,
    rateLimit({ windowMs: 60_000, limit: 20 }),
    async (request: StaffRequest, response) => {
      const config = twilioVoiceConfig()
      if (!hasTwilioBrowserConfig(config) || !request.user) {
        response.status(503).json({
          error:
            'As ligações ainda não foram configuradas pela administração.',
        })
        return
      }

      const identity = `evo-${request.user.id}`
        .replace(/[^a-zA-Z0-9_-]/g, '')
        .slice(0, 121)
      const AccessToken = twilio.jwt.AccessToken
      const VoiceGrant = AccessToken.VoiceGrant
      const token = new AccessToken(
        config.accountSid,
        config.apiKeySid,
        config.apiKeySecret,
        { identity, ttl: 15 * 60 },
      )
      token.addGrant(
        new VoiceGrant({
          outgoingApplicationSid: config.twimlAppSid,
        }),
      )
      const authorization = Buffer.from(
        `${config.accountSid}:${config.authToken}`,
      ).toString('base64')
      const turnResponse = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Tokens.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${authorization}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams(),
        },
      )
      const turnBody = turnResponse.ok
        ? ((await turnResponse.json()) as {
            ice_servers?: Array<{
              urls?: string | string[]
              username?: string
              credential?: string
            }>
          })
        : {}
      response.json({
        token: token.toJwt(),
        identity,
        iceServers: turnBody.ice_servers ?? [],
      })
    },
  )

  app.patch(
    '/api/cobranca/voice/recording',
    requireCollections,
    async (request, response) => {
      const enabled = request.body?.enabled === true
      await pool.query(
        `UPDATE collection_agent_settings
            SET record_calls = $1, updated_at = now()
          WHERE id = true`,
        [enabled],
      )
      response.json({ enabled })
    },
  )

  app.get(
    '/api/cobranca/voice/recordings',
    requireCollections,
    async (request, response) => {
      const building = String(request.query.building ?? '')
      const codes = String(request.query.codes ?? '')
        .split(',')
        .map((code) => code.trim())
        .filter((code) => /^\d{6}$/.test(code))
        .slice(0, 1000)
      if (!building || codes.length === 0) {
        response.json([])
        return
      }
      const { rows } = await pool.query(
        `SELECT id, associate_code, phone, call_sid, recording_sid,
                duration_seconds, created_at
           FROM collection_call_recordings
          WHERE building = $1
            AND associate_code = ANY($2::text[])
          ORDER BY created_at DESC
          LIMIT 500`,
        [building, codes],
      )
      response.json(rows.map((row) => recordingRow(row)))
    },
  )

  app.post(
    '/api/cobranca/voice/recordings',
    requireCollections,
    async (request: StaffRequest, response) => {
      const building = String(request.body?.building ?? '')
      const associateCode = String(request.body?.associateCode ?? '')
      const phone = String(request.body?.phone ?? '').replace(/\D/g, '')
      const callSid = String(request.body?.callSid ?? '')
      if (
        !building ||
        !/^\d{6}$/.test(associateCode) ||
        !/^CA[0-9a-f]{32}$/i.test(callSid)
      ) {
        response.status(400).json({ error: 'Não foi possível vincular a gravação ao contrato.' })
        return
      }
      const { rows } = await pool.query(
        `INSERT INTO collection_call_recordings
           (id, building, associate_code, phone, call_sid, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (call_sid) DO UPDATE
           SET phone = EXCLUDED.phone
         RETURNING id, associate_code, phone, call_sid, recording_sid,
                   duration_seconds, created_at`,
        [
          randomUUID(),
          building,
          associateCode,
          phone,
          callSid,
          request.user?.id ?? null,
        ],
      )
      response.status(201).json(recordingRow(rows[0]))
    },
  )

  app.post(
    '/api/cobranca/voice/recordings/:callSid/sync',
    requireCollections,
    async (request, response) => {
      const callSid = String(request.params.callSid)
      const config = twilioVoiceConfig()
      if (!hasTwilioBrowserConfig(config) || !/^CA[0-9a-f]{32}$/i.test(callSid)) {
        response.status(404).json({ error: 'Gravação não encontrada.' })
        return
      }
      const found = await twilioRecordingForCall(config, callSid)
      if (found) {
        await pool.query(
          `UPDATE collection_call_recordings
              SET recording_sid = $2, duration_seconds = $3
            WHERE call_sid = $1`,
          [callSid, found.recordingSid, found.durationSeconds],
        )
      }
      const { rows } = await pool.query(
        `SELECT id, associate_code, phone, call_sid, recording_sid,
                duration_seconds, created_at
           FROM collection_call_recordings
          WHERE call_sid = $1`,
        [callSid],
      )
      if (!rows[0]) {
        response.status(404).json({ error: 'Gravação não encontrada.' })
        return
      }
      response.json(recordingRow(rows[0]))
    },
  )

  app.get(
    '/api/cobranca/voice/recordings/:id/media',
    requireCollections,
    async (request, response) => {
      const config = twilioVoiceConfig()
      const { rows } = await pool.query(
        `SELECT recording_sid FROM collection_call_recordings WHERE id = $1`,
        [String(request.params.id)],
      )
      const recordingSid = rows[0]?.recording_sid
        ? String(rows[0].recording_sid)
        : ''
      if (!hasTwilioBrowserConfig(config) || !/^RE[0-9a-f]{32}$/i.test(recordingSid)) {
        response.status(404).json({ error: 'A gravação ainda está sendo preparada.' })
        return
      }
      const upstream = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Recordings/${recordingSid}.mp3`,
        { headers: { Authorization: `Basic ${twilioAuthorization(config)}` } },
      )
      if (!upstream.ok || !upstream.body) {
        response.status(502).json({ error: 'Não foi possível abrir a gravação.' })
        return
      }
      response.setHeader('Content-Type', 'audio/mpeg')
      response.setHeader('Content-Disposition', 'inline')
      Readable.fromWeb(upstream.body as import('node:stream/web').ReadableStream).pipe(response)
    },
  )

  app.get(
    '/api/cobranca/voice/recordings-download',
    requireCollections,
    async (request, response) => {
      const config = twilioVoiceConfig()
      const building = String(request.query.building ?? '')
      const codes = String(request.query.codes ?? '')
        .split(',')
        .map((code) => code.trim())
        .filter((code) => /^\d{6}$/.test(code))
        .slice(0, 1000)
      if (!hasTwilioBrowserConfig(config) || !building || codes.length === 0) {
        response.status(400).json({ error: 'Nenhuma gravação foi selecionada.' })
        return
      }
      const { rows } = await pool.query(
        `SELECT associate_code, recording_sid, created_at
           FROM collection_call_recordings
          WHERE building = $1
            AND associate_code = ANY($2::text[])
            AND recording_sid ~ '^RE[0-9a-fA-F]{32}$'
          ORDER BY associate_code, created_at DESC
          LIMIT 500`,
        [building, codes],
      )
      if (rows.length === 0) {
        response.status(404).json({ error: 'Ainda não existem gravações prontas para baixar.' })
        return
      }

      const authorization = `Basic ${twilioAuthorization(config)}`
      response.setHeader('Content-Type', 'application/zip')
      response.setHeader(
        'Content-Disposition',
        `attachment; filename="gravacoes-${building}-${new Date()
          .toISOString()
          .slice(0, 10)}.zip"`,
      )
      const archive = new ZipArchive({ zlib: { level: 1 } })
      archive.on('error', (error) => response.destroy(error))
      archive.pipe(response)
      for (const row of rows) {
        const recordingSid = String(row.recording_sid)
        const upstream = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Recordings/${recordingSid}.mp3`,
          { headers: { Authorization: authorization } },
        )
        if (!upstream.ok || !upstream.body) continue
        const stamp = new Date(String(row.created_at))
          .toISOString()
          .replace(/[:.]/g, '-')
        const stream = Readable.fromWeb(
          upstream.body as import('node:stream/web').ReadableStream,
        )
        const consumed = new Promise<void>((resolve) => {
          stream.once('end', resolve)
          stream.once('error', resolve)
        })
        archive.append(stream, {
          name: `contrato-${String(row.associate_code)}_${stamp}.mp3`,
        })
        await consumed
      }
      await archive.finalize()
    },
  )

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
      const updated = await pool.query(
        `UPDATE anticipation_entries e
            SET whatsapp_phone = $2
           FROM anticipation_sessions s
          WHERE e.session_id = s.id
            AND s.status <> 'closed'
            AND e.associate_code = (
              SELECT associate_code FROM anticipation_entries WHERE id = $1
            )
            AND s.building = (
              SELECT building
                FROM anticipation_sessions
               WHERE id = (SELECT session_id FROM anticipation_entries WHERE id = $1)
            )
          RETURNING e.associate_code, s.building`,
        [request.params.id, phone],
      )
      if (!updated.rowCount) {
        response.status(404).json({ error: 'Associado não encontrado.' })
        return
      }
      await pool.query(
        `INSERT INTO associate_phones (building, associate_code, phone)
         VALUES ($1, $2, $3)
         ON CONFLICT (building, associate_code)
         DO UPDATE SET phone = EXCLUDED.phone, updated_at = now()`,
        [
          updated.rows[0].building,
          updated.rows[0].associate_code,
          phone,
        ],
      )
      void runCollectionAgent().catch(() => undefined)
      response.json({ phone: phone ?? '' })
    },
  )
}
