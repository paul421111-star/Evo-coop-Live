import 'dotenv/config'
import { pool, transaction } from './db'

const SESSION_ID = 'demo-anticipation-group-12-block-d'
const TOTAL_ASSOCIATES = 633
const QUALIFIED_ASSOCIATES = 112

const firstNames = [
  'Ana',
  'Bruno',
  'Carla',
  'Daniel',
  'Elisa',
  'Fernando',
  'Gabriela',
  'Henrique',
  'Isabela',
  'João',
  'Larissa',
  'Marcos',
  'Natália',
  'Paulo',
  'Renata',
  'Sérgio',
]

const lastNames = [
  'Almeida',
  'Barbosa',
  'Costa',
  'Dias',
  'Ferreira',
  'Gomes',
  'Lima',
  'Martins',
  'Nascimento',
  'Oliveira',
  'Pereira',
  'Rocha',
  'Santos',
  'Silva',
  'Souza',
  'Teixeira',
]

const associates = Array.from({ length: TOTAL_ASSOCIATES }, (_, index) => {
  const number = index + 1
  const qualified = number <= QUALIFIED_ASSOCIATES
  const associateCode = `12${String(number).padStart(4, '0')}`
  const participant = `${firstNames[index % firstNames.length]} ${
    lastNames[Math.floor(index / firstNames.length) % lastNames.length]
  } ${lastNames[(index * 7 + 3) % lastNames.length]}`
  return {
    id: `${SESSION_ID}-${associateCode}`,
    associateCode,
    participant,
    paidInstallments: qualified
      ? 130 - Math.floor(index / 8)
      : 55 + ((TOTAL_ASSOCIATES - number) % 40),
    anticipatedInstallments: qualified ? 10 + (index % 21) : 0,
    offeredInstallments: qualified ? 0 : 5 + (index % 26),
    documentTail: '12345',
    offerStatus: qualified ? 'confirmed' : 'pending',
  }
})

async function seed() {
  await transaction(async (client) => {
    const admin = await client.query(
      `SELECT id FROM app_users WHERE role = 'admin' ORDER BY username LIMIT 1`,
    )
    if (!admin.rows[0]) {
      throw new Error('Execute npm run db:migrate antes de gerar os dados.')
    }

    await client.query(
      `INSERT INTO anticipation_sessions
        (id, building, draw_group, block_label, title, starts_at, ends_at,
         status, next_source, created_by, created_at, updated_at, closed_at,
         anticipator_slots)
       VALUES (
         $1, 'even', '12', 'Bloco D',
         'Antecipação Grupo 12 · Bloco D · 25/09/2026',
         '2026-09-25T09:00:00-03:00', '2026-09-25T18:00:00-03:00',
         'closed', 'anticipator', $2,
         '2026-09-25T09:00:00-03:00', '2026-09-25T18:00:00-03:00',
         '2026-09-25T18:00:00-03:00', $3
       )
       ON CONFLICT (id) DO UPDATE SET
         block_label = EXCLUDED.block_label,
         title = EXCLUDED.title,
         starts_at = EXCLUDED.starts_at,
         ends_at = EXCLUDED.ends_at,
         status = EXCLUDED.status,
         closed_at = EXCLUDED.closed_at,
         anticipator_slots = EXCLUDED.anticipator_slots`,
      [SESSION_ID, admin.rows[0].id, QUALIFIED_ASSOCIATES],
    )

    await client.query(
      'DELETE FROM anticipation_entries WHERE session_id = $1',
      [SESSION_ID],
    )

    await client.query(
      `INSERT INTO anticipation_entries
        (id, session_id, associate_code, participant, paid_installments,
         anticipated_installments, offered_installments, document_tail,
         offer_status, offer_selected_at)
       SELECT *
         FROM unnest(
           $1::text[], $2::text[], $3::text[], $4::text[], $5::integer[],
           $6::integer[], $7::integer[], $8::text[], $9::text[],
           $10::timestamptz[]
         )`,
      [
        associates.map((associate) => associate.id),
        associates.map(() => SESSION_ID),
        associates.map((associate) => associate.associateCode),
        associates.map((associate) => associate.participant),
        associates.map((associate) => associate.paidInstallments),
        associates.map((associate) => associate.anticipatedInstallments),
        associates.map((associate) => associate.offeredInstallments),
        associates.map((associate) => associate.documentTail),
        associates.map((associate) => associate.offerStatus),
        associates.map(() => '2026-09-25T12:00:00-03:00'),
      ],
    )
  })

  console.log(
    `Histórico criado: ${TOTAL_ASSOCIATES} associados; ${QUALIFIED_ASSOCIATES} classificados; ${TOTAL_ASSOCIATES - QUALIFIED_ASSOCIATES} para a próxima rodada.`,
  )
  await pool.end()
}

void seed()
