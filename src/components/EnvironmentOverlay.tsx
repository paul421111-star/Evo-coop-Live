import { Building2, Sunrise, Sunset, TreePine, Trees } from 'lucide-react'

type Props = {
  variant?: 'tower' | 'plan'
}

export function EnvironmentOverlay({ variant = 'tower' }: Props) {
  return (
    <div
      className={`environment-overlay ${variant === 'plan' ? 'is-plan' : ''}`}
      aria-label="Orientação do entorno do empreendimento"
    >
      <div className="environment-point environment-north">
        <TreePine size={16} />
        <span>
          <b>Futura área verde</b>
          <small>Norte</small>
        </span>
      </div>
      <div className="environment-point environment-east">
        <Trees size={16} />
        <span>
          <b>Área de mata</b>
          <small>Leste · Sol nasce</small>
        </span>
        <Sunrise className="solar-icon sunrise-icon" size={16} />
      </div>
      <div className="environment-point environment-south">
        <Building2 size={16} />
        <span>
          <b>Bloco C</b>
          <small>Sul</small>
        </span>
      </div>
      <div className="environment-point environment-west">
        <Building2 size={16} />
        <span>
          <b>Blocos G e F</b>
          <small>Oeste · Pôr do sol</small>
        </span>
        <Sunset className="solar-icon sunset-icon" size={16} />
      </div>
      <div className="site-compass" aria-hidden="true">
        <b className="direction-n">N</b>
        <b className="direction-l">L</b>
        <b className="direction-s">S</b>
        <b className="direction-o">O</b>
        <i />
      </div>
    </div>
  )
}
