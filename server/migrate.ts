import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { pool, transaction } from './db'
import {
  DEFAULT_EDGE_LANDMARKS,
  DEFAULT_SOLAR_ILLUSTRATIONS,
  DEFAULT_SURROUNDINGS,
} from '../src/config/surroundings'

const schema = `
CREATE TABLE IF NOT EXISTS app_users (
  id text PRIMARY KEY,
  username varchar(80) NOT NULL,
  password_hash text NOT NULL,
  role varchar(20) NOT NULL CHECK (role IN ('admin', 'operator_sede', 'operator_obra')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS app_users_username_lower_idx
  ON app_users (lower(username));

ALTER TABLE app_users DROP CONSTRAINT IF EXISTS app_users_role_check;
UPDATE app_users SET role = 'operator_sede' WHERE role = 'operator';
ALTER TABLE app_users ADD CONSTRAINT app_users_role_check
  CHECK (role IN ('admin', 'operator_sede', 'operator_obra'));

CREATE TABLE IF NOT EXISTS app_sessions (
  token_hash text PRIMARY KEY,
  user_id text NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS app_sessions_user_idx ON app_sessions(user_id);

CREATE TABLE IF NOT EXISTS apartment_reservations (
  storage_id varchar(32) PRIMARY KEY,
  building varchar(40) NOT NULL CHECK (building IN ('odd', 'even', 'jardim-artes', 'cond-iracema')),
  apartment_id varchar(12) NOT NULL,
  ball varchar(120),
  participant varchar(160) NOT NULL DEFAULT '',
  created_by text REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by text REFERENCES app_users(id) ON DELETE SET NULL,
  updated_at timestamptz,
  last_justification text
);
CREATE UNIQUE INDEX IF NOT EXISTS apartment_reservations_ball_idx
  ON apartment_reservations(building, lower(ball))
  WHERE ball IS NOT NULL AND length(trim(ball)) > 0;

ALTER TABLE apartment_reservations
  ADD COLUMN IF NOT EXISTS choice_source varchar(20) NOT NULL DEFAULT 'draw'
  CHECK (choice_source IN ('anticipator', 'draw'));
ALTER TABLE apartment_reservations
  ADD COLUMN IF NOT EXISTS anticipation_entry_id text;

CREATE TABLE IF NOT EXISTS contemplated_associates (
  building varchar(40) NOT NULL CHECK (building IN ('odd', 'even', 'jardim-artes', 'cond-iracema')),
  draw_group varchar(2),
  associate_code varchar(6) NOT NULL,
  apartment_id varchar(12) NOT NULL,
  session_id text,
  contemplated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (building, associate_code)
);
CREATE INDEX IF NOT EXISTS contemplated_associates_group_idx
  ON contemplated_associates(building, draw_group);

CREATE TABLE IF NOT EXISTS audit_events (
  id text PRIMARY KEY,
  storage_id varchar(32) NOT NULL,
  action varchar(20) NOT NULL CHECK (action IN ('created', 'updated', 'removed', 'imported')),
  actor_id text REFERENCES app_users(id) ON DELETE SET NULL,
  actor_name varchar(80) NOT NULL,
  reason text NOT NULL DEFAULT '',
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_events_storage_idx
  ON audit_events(storage_id, created_at DESC);

CREATE TABLE IF NOT EXISTS apartment_surroundings (
  building varchar(40) NOT NULL CHECK (building IN ('odd', 'even', 'jardim-artes', 'cond-iracema')),
  ending integer NOT NULL CHECK (ending BETWEEN 1 AND 8),
  item_id text NOT NULL,
  sort_order integer NOT NULL,
  label varchar(160) NOT NULL,
  icon varchar(30) NOT NULL,
  PRIMARY KEY (building, ending, item_id)
);

CREATE TABLE IF NOT EXISTS apartment_solar_illustrations (
  building varchar(40) NOT NULL CHECK (building IN ('odd', 'even', 'jardim-artes', 'cond-iracema')),
  ending integer NOT NULL CHECK (ending BETWEEN 1 AND 8),
  illustration varchar(20) NOT NULL CHECK (illustration IN ('sunrise', 'sunset', 'future-green')),
  PRIMARY KEY (building, ending, illustration)
);

CREATE TABLE IF NOT EXISTS apartment_edge_landmarks (
  building varchar(40) NOT NULL CHECK (building IN ('odd', 'even', 'jardim-artes', 'cond-iracema')),
  ending integer NOT NULL CHECK (ending BETWEEN 1 AND 8),
  landmark varchar(20) NOT NULL CHECK (landmark IN ('sao-judas', 'br-116', 'main-gate', 'bloco-b', 'bloco-c', 'blocos-gf', 'sunrise', 'sunset')),
  PRIMARY KEY (building, ending, landmark)
);

ALTER TABLE apartment_reservations
  DROP CONSTRAINT IF EXISTS apartment_reservations_building_check;
ALTER TABLE apartment_reservations
  ALTER COLUMN building TYPE varchar(40);
ALTER TABLE apartment_reservations
  ADD CONSTRAINT apartment_reservations_building_check
  CHECK (building IN ('odd', 'even', 'jardim-artes', 'cond-iracema'));

ALTER TABLE apartment_surroundings
  DROP CONSTRAINT IF EXISTS apartment_surroundings_building_check;
ALTER TABLE apartment_surroundings
  ALTER COLUMN building TYPE varchar(40);
ALTER TABLE apartment_surroundings
  ADD CONSTRAINT apartment_surroundings_building_check
  CHECK (building IN ('odd', 'even', 'jardim-artes', 'cond-iracema'));

ALTER TABLE apartment_solar_illustrations
  DROP CONSTRAINT IF EXISTS apartment_solar_illustrations_building_check;
ALTER TABLE apartment_solar_illustrations
  ADD CONSTRAINT apartment_solar_illustrations_building_check
  CHECK (building IN ('odd', 'even', 'jardim-artes', 'cond-iracema'));
ALTER TABLE apartment_solar_illustrations
  DROP CONSTRAINT IF EXISTS apartment_solar_illustrations_illustration_check;
ALTER TABLE apartment_solar_illustrations
  ADD CONSTRAINT apartment_solar_illustrations_illustration_check
  CHECK (illustration IN ('sunrise', 'sunset', 'future-green'));

-- Cada final pode exibir mais de uma ilustração, então a chave inclui qual é.
ALTER TABLE apartment_solar_illustrations
  DROP CONSTRAINT IF EXISTS apartment_solar_illustrations_pkey;
ALTER TABLE apartment_solar_illustrations
  ADD CONSTRAINT apartment_solar_illustrations_pkey
  PRIMARY KEY (building, ending, illustration);

CREATE TABLE IF NOT EXISTS apartment_edge_landmarks (
  building varchar(40) NOT NULL CHECK (building IN ('odd', 'even', 'jardim-artes', 'cond-iracema')),
  ending integer NOT NULL CHECK (ending BETWEEN 1 AND 8),
  landmark varchar(20) NOT NULL CHECK (landmark IN ('sao-judas', 'br-116', 'main-gate', 'bloco-b', 'bloco-c', 'blocos-gf', 'sunrise', 'sunset')),
  PRIMARY KEY (building, ending, landmark)
);

CREATE TABLE IF NOT EXISTS draw_declines (
  id text PRIMARY KEY,
  building varchar(40) NOT NULL CHECK (building IN ('odd', 'even', 'jardim-artes', 'cond-iracema')),
  ball varchar(120) NOT NULL,
  participant varchar(160) NOT NULL DEFAULT '',
  source varchar(20) NOT NULL DEFAULT 'draw' CHECK (source IN ('draw', 'anticipator')),
  reason varchar(30) NOT NULL CHECK (reason IN ('refused', 'next-tower', 'no-answer')),
  notes varchar(240) NOT NULL DEFAULT '',
  created_by text REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS draw_declines_ball_idx
  ON draw_declines(building, lower(ball));

ALTER TABLE draw_declines
  ADD COLUMN IF NOT EXISTS source varchar(20) NOT NULL DEFAULT 'draw'
  CHECK (source IN ('draw', 'anticipator'));

ALTER TABLE draw_declines
  DROP CONSTRAINT IF EXISTS draw_declines_building_check;
ALTER TABLE draw_declines
  ADD CONSTRAINT draw_declines_building_check
  CHECK (building IN ('odd', 'even', 'jardim-artes', 'cond-iracema'));

CREATE TABLE IF NOT EXISTS draw_archives (
  id text PRIMARY KEY,
  building varchar(40) NOT NULL CHECK (building IN ('odd', 'even', 'jardim-artes', 'cond-iracema')),
  draw_group varchar(2),
  title varchar(160) NOT NULL,
  notes varchar(240) NOT NULL DEFAULT '',
  reservation_count integer NOT NULL DEFAULT 0,
  decline_count integer NOT NULL DEFAULT 0,
  snapshot jsonb NOT NULL,
  archived_by text REFERENCES app_users(id) ON DELETE SET NULL,
  archived_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS draw_archives_building_idx
  ON draw_archives(building, archived_at DESC);

-- Preserva também os contemplados existentes antes desta versão.
INSERT INTO contemplated_associates
  (building, draw_group, associate_code, apartment_id, contemplated_at)
SELECT building, left(trim(ball), 2), trim(ball), apartment_id, created_at
  FROM apartment_reservations
 WHERE ball ~ '^[0-9]{6}$'
ON CONFLICT (building, associate_code) DO NOTHING;

INSERT INTO contemplated_associates
  (building, draw_group, associate_code, apartment_id, contemplated_at)
SELECT a.building,
       COALESCE(a.draw_group, left(item.assignment->>'ball', 2)),
       item.assignment->>'ball',
       regexp_replace(item.storage_id, '^.*:', ''),
       a.archived_at
  FROM draw_archives a
 CROSS JOIN LATERAL jsonb_each(
   COALESCE(a.snapshot->'assignments', '{}'::jsonb)
 ) AS item(storage_id, assignment)
 WHERE item.assignment->>'ball' ~ '^[0-9]{6}$'
ON CONFLICT (building, associate_code) DO NOTHING;

CREATE TABLE IF NOT EXISTS anticipation_sessions (
  id text PRIMARY KEY,
  building varchar(40) NOT NULL CHECK (building IN ('odd', 'even', 'jardim-artes', 'cond-iracema')),
  draw_group varchar(2),
  title varchar(160) NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'locked', 'active', 'closed')),
  next_source varchar(20) NOT NULL DEFAULT 'anticipator'
    CHECK (next_source IN ('anticipator', 'draw')),
  created_by text REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  live_url text NOT NULL DEFAULT '',
  anticipator_slots integer NOT NULL DEFAULT 112
    CHECK (anticipator_slots >= 0),
  block_label varchar(80) NOT NULL DEFAULT '',
  closed_at timestamptz,
  CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS anticipation_sessions_lookup_idx
  ON anticipation_sessions(building, draw_group, created_at DESC);

CREATE TABLE IF NOT EXISTS anticipation_entries (
  id text PRIMARY KEY,
  session_id text NOT NULL REFERENCES anticipation_sessions(id) ON DELETE CASCADE,
  associate_code varchar(6) NOT NULL CHECK (associate_code ~ '^[0-9]{6}$'),
  participant varchar(160) NOT NULL DEFAULT '',
  paid_installments integer NOT NULL DEFAULT 0 CHECK (paid_installments >= 0),
  anticipated_installments integer NOT NULL DEFAULT 0
    CHECK (anticipated_installments BETWEEN 0 AND 30),
  offered_installments integer NOT NULL DEFAULT 0
    CHECK (offered_installments BETWEEN 0 AND 30),
  status varchar(20) NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'selected', 'declined')),
  apartment_id varchar(12),
  document_tail varchar(5) CHECK (document_tail IS NULL OR document_tail ~ '^[0-9]{5}$'),
  offer_status varchar(20) NOT NULL DEFAULT 'pending'
    CHECK (offer_status IN ('pending', 'confirmed', 'withdrawn')),
  offer_selected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, associate_code)
);
CREATE INDEX IF NOT EXISTS anticipation_entries_session_idx
  ON anticipation_entries(session_id, status);

ALTER TABLE anticipation_sessions
  ADD COLUMN IF NOT EXISTS live_url text NOT NULL DEFAULT '';
ALTER TABLE anticipation_sessions
  ADD COLUMN IF NOT EXISTS anticipator_slots integer NOT NULL DEFAULT 112;
ALTER TABLE anticipation_sessions
  ADD COLUMN IF NOT EXISTS block_label varchar(80) NOT NULL DEFAULT '';
ALTER TABLE anticipation_sessions
  ADD COLUMN IF NOT EXISTS closed_at timestamptz;
ALTER TABLE anticipation_sessions
  ADD COLUMN IF NOT EXISTS confirmation_deadline timestamptz;
ALTER TABLE anticipation_sessions
  ADD COLUMN IF NOT EXISTS awaiting_next boolean NOT NULL DEFAULT false;
ALTER TABLE anticipation_sessions
  ADD COLUMN IF NOT EXISTS held_storage_id text;
ALTER TABLE anticipation_sessions
  DROP CONSTRAINT IF EXISTS anticipation_sessions_status_check;
ALTER TABLE anticipation_sessions
  ADD CONSTRAINT anticipation_sessions_status_check
  CHECK (status IN ('draft', 'locked', 'active', 'closed'));
ALTER TABLE anticipation_entries
  ADD COLUMN IF NOT EXISTS document_tail varchar(5);
ALTER TABLE anticipation_entries
  ADD COLUMN IF NOT EXISTS offer_status varchar(20) NOT NULL DEFAULT 'pending';
ALTER TABLE anticipation_entries
  ADD COLUMN IF NOT EXISTS offer_selected_at timestamptz;

CREATE TABLE IF NOT EXISTS associate_portal_sessions (
  token_hash text PRIMARY KEY,
  entry_id text NOT NULL REFERENCES anticipation_entries(id) ON DELETE CASCADE,
  session_id text NOT NULL REFERENCES anticipation_sessions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS associate_portal_sessions_expiry_idx
  ON associate_portal_sessions(expires_at);

ALTER TABLE anticipation_entries
  ADD COLUMN IF NOT EXISTS whatsapp_phone varchar(20);

CREATE TABLE IF NOT EXISTS whatsapp_lines (
  id text PRIMARY KEY,
  department varchar(40) NOT NULL DEFAULT 'cobranca'
    CHECK (department IN ('cobranca')),
  name varchar(120) NOT NULL,
  sigla varchar(4) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS collection_agent_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  enabled boolean NOT NULL DEFAULT false,
  installment_value numeric(12, 2) NOT NULL DEFAULT 0
    CHECK (installment_value >= 0),
  line_id text REFERENCES whatsapp_lines(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO collection_agent_settings (id)
VALUES (true)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS whatsapp_conversations (
  id text PRIMARY KEY,
  line_id text NOT NULL REFERENCES whatsapp_lines(id) ON DELETE CASCADE,
  jid text NOT NULL,
  phone varchar(20),
  contact_name varchar(160) NOT NULL DEFAULT '',
  last_preview text NOT NULL DEFAULT '',
  last_message_at timestamptz NOT NULL DEFAULT now(),
  unread_count integer NOT NULL DEFAULT 0,
  UNIQUE (line_id, jid)
);
CREATE INDEX IF NOT EXISTS whatsapp_conversations_line_idx
  ON whatsapp_conversations(line_id, last_message_at DESC);

CREATE TABLE IF NOT EXISTS whatsapp_contacts (
  line_id text NOT NULL REFERENCES whatsapp_lines(id) ON DELETE CASCADE,
  jid text NOT NULL,
  name varchar(160) NOT NULL,
  phone varchar(20),
  PRIMARY KEY (line_id, jid)
);

CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id text PRIMARY KEY,
  conversation_id text NOT NULL
    REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
  wa_id text,
  from_me boolean NOT NULL,
  body text NOT NULL DEFAULT '',
  kind varchar(20) NOT NULL DEFAULT 'text',
  sent_at timestamptz NOT NULL DEFAULT now(),
  sender_name varchar(160) NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_messages_wa_idx
  ON whatsapp_messages(conversation_id, wa_id)
  WHERE wa_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS whatsapp_messages_conversation_idx
  ON whatsapp_messages(conversation_id, sent_at);

-- Recalcula a prévia das conversas importadas antes da correção do histórico.
UPDATE whatsapp_conversations c
   SET last_message_at = m.sent_at,
       last_preview = COALESCE(
         NULLIF(left(m.body, 200), ''),
         CASE m.kind
           WHEN 'image' THEN '[imagem]'
           WHEN 'video' THEN '[vídeo]'
           WHEN 'audio' THEN '[áudio]'
           WHEN 'document' THEN '[documento]'
           WHEN 'sticker' THEN '[figurinha]'
           WHEN 'location' THEN '[localização]'
           WHEN 'contact' THEN '[contato]'
           WHEN 'poll' THEN '[enquete]'
           ELSE '[mensagem]'
         END
       )
  FROM (
    SELECT DISTINCT ON (conversation_id) conversation_id, sent_at, body, kind
      FROM whatsapp_messages
     ORDER BY conversation_id, sent_at DESC
  ) m
 WHERE m.conversation_id = c.id
   AND c.last_preview = '';

-- Usa o nome exibido pelo contato nas mensagens quando a agenda não trouxe nome.
UPDATE whatsapp_conversations c
   SET contact_name = m.sender_name
  FROM (
    SELECT DISTINCT ON (conversation_id) conversation_id, sender_name
      FROM whatsapp_messages
     WHERE sender_name <> ''
     ORDER BY conversation_id, sent_at DESC
  ) m
 WHERE m.conversation_id = c.id
   AND c.contact_name = '';

CREATE TABLE IF NOT EXISTS anticipation_dispatches (
  entry_id text PRIMARY KEY
    REFERENCES anticipation_entries(id) ON DELETE CASCADE,
  line_id text,
  phone varchar(20) NOT NULL,
  installments integer NOT NULL,
  amount numeric(12, 2) NOT NULL,
  message text NOT NULL,
  status varchar(20) NOT NULL CHECK (status IN ('sent', 'failed')),
  error text,
  sent_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product_issues (
  id text PRIMARY KEY,
  issue_number integer GENERATED BY DEFAULT AS IDENTITY UNIQUE,
  title varchar(180) NOT NULL,
  kind varchar(20) NOT NULL CHECK (kind IN ('falha', 'melhoria')),
  priority varchar(20) NOT NULL CHECK (priority IN ('baixa', 'media', 'alta')),
  stage varchar(20) NOT NULL DEFAULT 'backlog' CHECK (stage IN ('backlog', 'doing', 'done')),
  context text NOT NULL,
  expected text NOT NULL DEFAULT '',
  place text NOT NULL DEFAULT '',
  author_name varchar(80) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS product_issues_stage_idx
  ON product_issues(stage, created_at DESC);
`

async function migrate() {
  await transaction(async (client) => {
    await client.query(schema)

    const username = process.env.ADMIN_USERNAME ?? 'Paulo'
    const password = process.env.ADMIN_PASSWORD
    if (!password) throw new Error('ADMIN_PASSWORD não configurada.')
    const passwordHash = await bcrypt.hash(password, 12)
    await client.query(
      `INSERT INTO app_users (id, username, password_hash, role)
       VALUES ($1, $2, $3, 'admin')
       ON CONFLICT DO NOTHING`,
      [randomUUID(), username, passwordHash],
    )

    const buildingAlreadySaved = async (table: string, building: string) => {
      const existing = await client.query(
        `SELECT 1 FROM ${table} WHERE building = $1 LIMIT 1`,
        [building],
      )
      return (existing.rowCount ?? 0) > 0
    }

    for (const [building, endings] of Object.entries(DEFAULT_SURROUNDINGS)) {
      if (await buildingAlreadySaved('apartment_surroundings', building)) continue
      for (const [ending, items] of Object.entries(endings)) {
        for (const [index, item] of (items ?? []).entries()) {
          await client.query(
            `INSERT INTO apartment_surroundings
              (building, ending, item_id, sort_order, label, icon)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [building, Number(ending), item.id, index, item.label, item.icon],
          )
        }
      }
    }

    for (const [building, endings] of Object.entries(
      DEFAULT_SOLAR_ILLUSTRATIONS,
    )) {
      if (await buildingAlreadySaved('apartment_solar_illustrations', building))
        continue
      for (const [ending, illustrations] of Object.entries(endings)) {
        for (const illustration of illustrations ?? []) {
          await client.query(
            `INSERT INTO apartment_solar_illustrations
              (building, ending, illustration)
             VALUES ($1, $2, $3)`,
            [building, Number(ending), illustration],
          )
        }
      }
    }

    for (const [building, endings] of Object.entries(DEFAULT_EDGE_LANDMARKS)) {
      if (await buildingAlreadySaved('apartment_edge_landmarks', building))
        continue
      for (const [ending, landmarks] of Object.entries(endings)) {
        for (const landmark of landmarks ?? []) {
          await client.query(
            `INSERT INTO apartment_edge_landmarks
              (building, ending, landmark)
             VALUES ($1, $2, $3)`,
            [building, Number(ending), landmark],
          )
        }
      }
    }
  })

  console.log('Banco Evo Coop Live preparado com sucesso.')
}

migrate()
  .catch((error) => {
    console.error('Falha ao preparar o banco:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await pool.end()
  })
