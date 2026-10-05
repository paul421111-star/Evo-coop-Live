import {
  anticipationMessage,
  storedWhatsappPhone,
} from '../../src/config/collectionNotice'
import { pool } from '../db'
import {
  connectedLineIds,
  lineSnapshot,
  resumeLines,
  sendText,
} from './gateway'

export type AgentSettings = {
  enabled: boolean
  installmentValue: number
  lineId: string | null
}

export async function readAgentSettings(): Promise<AgentSettings> {
  const { rows } = await pool.query(
    `SELECT enabled, installment_value, line_id
       FROM collection_agent_settings
      WHERE id = true`,
  )
  const row = rows[0]
  return {
    enabled: true,
    installmentValue: Number(row?.installment_value ?? 0),
    lineId: row?.line_id ? String(row.line_id) : null,
  }
}

function senderId(settings: AgentSettings) {
  const connected = connectedLineIds()
  if (settings.lineId && connected.includes(settings.lineId)) return settings.lineId
  if (settings.lineId && lineSnapshot(settings.lineId).connected) {
    return settings.lineId
  }
  return connected[0] ?? null
}

let ticking = false

export async function runCollectionAgent() {
  if (ticking) return
  ticking = true
  try {
    const settings = await readAgentSettings()
    // O agente fica sempre de olho no ranking; só precisa do valor da parcela
    // e de um celular conectado para enviar.
    if (settings.installmentValue <= 0) return
    const lineId = senderId(settings)
    if (!lineId) return
    const { rows } = await pool.query(
      `SELECT e.id, e.associate_code, e.participant, e.anticipated_installments,
              e.whatsapp_phone
         FROM anticipation_entries e
         JOIN anticipation_sessions s ON s.id = e.session_id
         LEFT JOIN anticipation_dispatches d ON d.entry_id = e.id
        WHERE s.status <> 'closed'
          AND e.offer_status = 'confirmed'
          AND e.anticipated_installments > 0
          AND e.whatsapp_phone IS NOT NULL
          AND (d.status IS NULL OR d.status = 'failed')
        ORDER BY e.offer_selected_at NULLS LAST
        LIMIT 20`,
    )
    for (const row of rows) {
      const phone = storedWhatsappPhone(row.whatsapp_phone)
      const installments = Number(row.anticipated_installments)
      if (!phone || installments <= 0) continue
      const message = anticipationMessage({
        participant: String(row.participant ?? ''),
        associateCode: String(row.associate_code),
        installments,
        installmentValue: settings.installmentValue,
      })
      try {
        await sendText(lineId, phone, message)
        await pool.query(
          `INSERT INTO anticipation_dispatches
            (entry_id, line_id, phone, installments, amount, message, status, error, sent_at)
           VALUES ($1, $2, $3, $4, $5, $6, 'sent', NULL, now())
           ON CONFLICT (entry_id) DO UPDATE
             SET line_id = EXCLUDED.line_id,
                 phone = EXCLUDED.phone,
                 installments = EXCLUDED.installments,
                 amount = EXCLUDED.amount,
                 message = EXCLUDED.message,
                 status = 'sent',
                 error = NULL,
                 sent_at = now()`,
          [
            row.id,
            lineId,
            phone,
            installments,
            installments * settings.installmentValue,
            message,
          ],
        )
      } catch (error) {
        const reason =
          error instanceof Error
            ? error.message
            : 'Não foi possível enviar o WhatsApp.'
        await pool.query(
          `INSERT INTO anticipation_dispatches
            (entry_id, line_id, phone, installments, amount, message, status, error, sent_at)
           VALUES ($1, $2, $3, $4, $5, $6, 'failed', $7, now())
           ON CONFLICT (entry_id) DO UPDATE
             SET status = 'failed',
                 error = EXCLUDED.error,
                 sent_at = now()
           WHERE anticipation_dispatches.status <> 'sent'`,
          [
            row.id,
            lineId,
            phone,
            installments,
            installments * settings.installmentValue,
            message,
            reason.slice(0, 300),
          ],
        )
      }
    }
  } finally {
    ticking = false
  }
}

export function startCollectionAgent() {
  void pool
    .query(`SELECT id FROM whatsapp_lines WHERE department = 'cobranca'`)
    .then((result) => resumeLines(result.rows.map((row) => String(row.id))))
    .catch((error: unknown) => {
      console.error('[cobranca] falha ao religar celulares', error)
    })
  void runCollectionAgent().catch((error: unknown) => {
    console.error('[cobranca] falha na verificação inicial', error)
  })
  setInterval(() => {
    void runCollectionAgent().catch((error: unknown) => {
      console.error('[cobranca] falha ao verificar o ranking', error)
    })
  }, 10000)
}
