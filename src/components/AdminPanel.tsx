import { useEffect, useState } from 'react'
import { Plus, Trash2, UserPlus, Users, X } from 'lucide-react'
import {
  createOperator,
  listUsers,
  removeOperator,
  type AppUser,
} from '../auth/localAuth'
import { BUILDING_CONFIGS, type BuildingKind, type Ending } from '../config/building'
import {
  SURROUNDING_ICON_OPTIONS,
  type SurroundingIcon as IconName,
  type SurroundingItem,
  type SurroundingsConfig,
} from '../config/surroundings'
import { SurroundingIcon } from './SurroundingIcon'
import { createLocalId } from '../utils/localCrypto'

type Props = {
  surroundings: SurroundingsConfig
  onUpdate: (
    building: BuildingKind,
    ending: Ending,
    items: SurroundingItem[],
  ) => void
  onClose: () => void
}

export function AdminPanel({ surroundings, onUpdate, onClose }: Props) {
  const [users, setUsers] = useState<AppUser[]>([])
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [userError, setUserError] = useState('')
  const [building, setBuilding] = useState<BuildingKind>('odd')

  useEffect(() => {
    void listUsers().then(setUsers)
  }, [])

  const addUser = async () => {
    try {
      const operator = await createOperator(username, password)
      setUsers((current) => [...current, operator])
      setUsername('')
      setPassword('')
      setUserError('')
    } catch (error) {
      setUserError(
        error instanceof Error ? error.message : 'Não foi possível criar a conta.',
      )
    }
  }

  const deleteUser = async (user: AppUser) => {
    if (!window.confirm(`Remover o operador ${user.username}?`)) return
    await removeOperator(user.id)
    setUsers((current) => current.filter(({ id }) => id !== user.id))
  }

  const updateItem = (
    ending: Ending,
    id: string,
    patch: Partial<SurroundingItem>,
  ) => {
    const items = surroundings[building][ending] ?? []
    onUpdate(
      building,
      ending,
      items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    )
  }

  const removeItem = (ending: Ending, id: string) => {
    onUpdate(
      building,
      ending,
      (surroundings[building][ending] ?? []).filter((item) => item.id !== id),
    )
  }

  const addItem = (ending: Ending) => {
    const items = surroundings[building][ending] ?? []
    onUpdate(building, ending, [
      ...items,
      {
        id: createLocalId(),
        label: 'Nova indicação',
        icon: 'tree',
      },
    ])
  }

  return (
    <div className="modal-backdrop">
      <section
        className="admin-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-title"
      >
        <div className="modal-heading admin-heading">
          <div>
            <span className="eyebrow">Acesso administrativo</span>
            <h2 id="admin-title">Administração</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        <section className="admin-section">
          <div className="admin-section-title">
            <Users size={17} />
            <div>
              <h3>Operadores</h3>
              <p>Cada inclusão e alteração será registrada em seu nome.</p>
            </div>
          </div>
          <div className="new-user-row">
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Nome do usuário"
            />
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Senha inicial"
            />
            <button type="button" onClick={() => void addUser()}>
              <UserPlus size={15} /> Cadastrar
            </button>
          </div>
          {userError && <p className="admin-error">{userError}</p>}
          <div className="user-list">
            {users.map((user) => (
              <div key={user.id}>
                <span className="user-avatar">
                  {user.username.slice(0, 1).toUpperCase()}
                </span>
                <span>
                  <b>{user.username}</b>
                  <small>
                    {user.role === 'admin' ? 'Administrador' : 'Operador'}
                  </small>
                </span>
                {user.role !== 'admin' && (
                  <button
                    type="button"
                    onClick={() => void deleteUser(user)}
                    aria-label={`Remover ${user.username}`}
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="admin-section indications-admin">
          <div className="admin-section-title">
            <SurroundingIcon icon="park" size={17} />
            <div>
              <h3>Indicações por final</h3>
              <p>Personalize as informações exibidas ao lado da unidade.</p>
            </div>
          </div>
          <div className="admin-building-tabs">
            {(Object.keys(BUILDING_CONFIGS) as BuildingKind[]).map((kind) => (
              <button
                type="button"
                key={kind}
                className={building === kind ? 'active' : ''}
                onClick={() => setBuilding(kind)}
              >
                {BUILDING_CONFIGS[kind].label}
              </button>
            ))}
          </div>
          <div className="indication-edit-list">
            {BUILDING_CONFIGS[building].endings.map((ending) => (
              <article key={ending}>
                <header>
                  <b>Final {ending}</b>
                  <button type="button" onClick={() => addItem(ending)}>
                    <Plus size={13} /> Adicionar
                  </button>
                </header>
                {(surroundings[building][ending] ?? []).map((item) => (
                  <div className="indication-edit-row" key={item.id}>
                    <SurroundingIcon icon={item.icon} size={16} />
                    <input
                      value={item.label}
                      onChange={(event) =>
                        updateItem(ending, item.id, {
                          label: event.target.value,
                        })
                      }
                      aria-label={`Nome da indicação do final ${ending}`}
                    />
                    <select
                      value={item.icon}
                      onChange={(event) =>
                        updateItem(ending, item.id, {
                          icon: event.target.value as IconName,
                        })
                      }
                      aria-label={`Ícone da indicação ${item.label}`}
                    >
                      {SURROUNDING_ICON_OPTIONS.map((icon) => (
                        <option value={icon.id} key={icon.id}>
                          {icon.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => removeItem(ending, item.id)}
                      aria-label={`Remover indicação ${item.label}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </article>
            ))}
          </div>
        </section>
      </section>
    </div>
  )
}
