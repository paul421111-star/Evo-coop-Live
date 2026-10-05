import { useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  Layers3,
  MapPin,
} from 'lucide-react'
import type { DrawGroup } from '../config/drawGroups'
import {
  BLOCKS,
  PROJECTS,
  buildingForProjectGroup,
  type BlockCode,
  type EventWorkspace,
  type ProjectKind,
} from '../config/eventWorkspace'
import { SiteFooter } from './SiteFooter'

type Props = {
  onConfirm: (workspace: EventWorkspace) => void
}

export function EventWorkspacePicker({ onConfirm }: Props) {
  const [projectId, setProjectId] = useState<ProjectKind | null>(null)
  const project = PROJECTS.find((item) => item.id === projectId)
  const [group, setGroup] = useState<DrawGroup | null>(null)
  const [block, setBlock] = useState<BlockCode | null>(null)

  const selectProject = (id: ProjectKind) => {
    const next = PROJECTS.find((item) => item.id === id)!
    setProjectId(id)
    setGroup(next.groups.length === 1 ? next.groups[0] : null)
    setBlock(next.defaultBlock)
  }

  const confirm = () => {
    if (!project || !group || !block) return
    onConfirm({
      project: project.id,
      building: buildingForProjectGroup(project.id, group),
      group,
      block,
    })
  }

  return (
    <main className="event-picker">
      <header className="event-picker-topbar">
        <img
          src="/vida-nova-30-anos.png"
          alt="Cooperativa Habitacional Vida Nova — 30 anos"
        />
        <div>
          <strong>Cooperativa Habitacional Vida Nova</strong>
          <small>Paulo B. · CHVN</small>
        </div>
      </header>

      <section className="event-picker-content">
        <div className="event-picker-heading">
          <span className="eyebrow">Organização do evento</span>
          <h1>
            {project ? 'Selecione o grupo e o bloco' : 'Escolha o condomínio'}
          </h1>
          <p>
            {project
              ? `Configure o evento do ${project.name}.`
              : 'Selecione o empreendimento que será utilizado no evento de hoje.'}
          </p>
        </div>

        {!project ? (
          <div className="project-card-grid">
            {PROJECTS.map((item) => (
              <button
                key={item.id}
                type="button"
                className="project-card"
                onClick={() => selectProject(item.id)}
              >
                <span className="project-card-image">
                  <img src={item.image} alt="" />
                  <i>Em andamento</i>
                </span>
                <span className="project-card-body">
                  <strong>{item.name}</strong>
                  <small>
                    <MapPin size={12} /> {item.location}
                  </small>
                  <span>
                    Grupos {item.groups.join(', ')}
                    <ArrowRight size={16} />
                  </span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="event-setup">
            <aside className="event-selected-project">
              <img src={project.image} alt="" />
              <div>
                <span>Condomínio selecionado</span>
                <h2>{project.name}</h2>
                <small>
                  <MapPin size={13} /> {project.location}
                </small>
              </div>
              <button type="button" onClick={() => setProjectId(null)}>
                <ArrowLeft size={15} /> Trocar condomínio
              </button>
            </aside>

            <section className="event-options">
              <div className="event-option-section">
                <div>
                  <span className="event-option-icon">
                    <Layers3 size={18} />
                  </span>
                  <div>
                    <h2>Grupo do evento</h2>
                    <p>Escolha o grupo que participará desta sessão.</p>
                  </div>
                </div>
                <div className="event-choice-grid is-groups">
                  {project.groups.map((item) => (
                    <button
                      key={item}
                      type="button"
                      className={group === item ? 'is-selected' : ''}
                      onClick={() => setGroup(item)}
                    >
                      <span>Grupo</span>
                      <strong>{item}</strong>
                      {group === item && <Check size={15} />}
                    </button>
                  ))}
                </div>
                {project.id === 'firenze' && group && (
                  <p className="event-group-note">
                    {Number(group) % 2 === 0
                      ? 'Torre Firenze · apartamentos pares'
                      : 'Torre Firenze · apartamentos ímpares'}
                  </p>
                )}
              </div>

              <div className="event-option-section">
                <div>
                  <span className="event-option-icon">
                    <Building2 size={18} />
                  </span>
                  <div>
                    <h2>Bloco</h2>
                    <p>O bloco ficará destacado durante todo o evento.</p>
                  </div>
                  <span className="delivery-badge">{project.deliveryLabel}</span>
                </div>
                <div className="event-choice-grid is-blocks">
                  {BLOCKS.map((item) => (
                    <button
                      key={item}
                      type="button"
                      className={block === item ? 'is-selected' : ''}
                      onClick={() => setBlock(item)}
                    >
                      <span>Bloco</span>
                      <strong>{item}</strong>
                      {block === item && <Check size={15} />}
                    </button>
                  ))}
                </div>
              </div>

              <footer className="event-setup-footer">
                <div>
                  <small>Evento selecionado</small>
                  <strong>
                    {project.name}
                    {group ? ` · Grupo ${group}` : ''}
                    {block ? ` · Bloco ${block}` : ''}
                  </strong>
                </div>
                <button
                  type="button"
                  className="event-confirm-button"
                  disabled={!group || !block}
                  onClick={confirm}
                >
                  Acessar evento <ArrowRight size={17} />
                </button>
              </footer>
            </section>
          </div>
        )}
      </section>
      <SiteFooter />
    </main>
  )
}
