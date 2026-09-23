import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { pool, transaction } from './db'
import { DEFAULT_SURROUNDINGS } from '../src/config/surroundings'

const schema = `
CREATE TABLE IF NOT EXISTS app_users (
  id text PRIMARY KEY,
  username varchar(80) NOT NULL,
  password_hash text NOT NULL,
  role varchar(20) NOT NULL CHECK (role IN ('admin', 'operator')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS app_users_username_lower_idx
  ON app_users (lower(username));

CREATE TABLE IF NOT EXISTS app_sessions (
  token_hash text PRIMARY KEY,
  user_id text NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS app_sessions_user_idx ON app_sessions(user_id);

CREATE TABLE IF NOT EXISTS apartment_reservations (
  storage_id varchar(32) PRIMARY KEY,
  building varchar(10) NOT NULL CHECK (building IN ('odd', 'even')),
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
  building varchar(10) NOT NULL CHECK (building IN ('odd', 'even')),
  ending integer NOT NULL CHECK (ending BETWEEN 1 AND 8),
  item_id text NOT NULL,
  sort_order integer NOT NULL,
  label varchar(160) NOT NULL,
  icon varchar(30) NOT NULL,
  PRIMARY KEY (building, ending, item_id)
);
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

    const { rows } = await client.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM apartment_surroundings',
    )
    if (Number(rows[0]?.count ?? 0) === 0) {
      for (const [building, endings] of Object.entries(DEFAULT_SURROUNDINGS)) {
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
