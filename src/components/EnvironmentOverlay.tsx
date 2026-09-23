import { SurroundingIcon } from './SurroundingIcon'
import {
  EDGE_LANDMARK_BY_ID,
  type EdgeLandmark,
} from '../config/surroundings'

type Props = {
  variant?: 'tower' | 'plan'
  showLabels?: boolean
  landmarks?: EdgeLandmark[]
  activeLandmarks?: EdgeLandmark[]
}

export function EnvironmentOverlay({
  variant = 'tower',
  showLabels = true,
  landmarks = [],
  activeLandmarks,
}: Props) {
  const highlightAll = activeLandmarks === undefined

  return (
    <div
      className={`environment-overlay ${variant === 'plan' ? 'is-plan' : ''}`}
      aria-label="Orientação do entorno do empreendimento"
    >
      {showLabels &&
        landmarks.map((id) => {
          const option = EDGE_LANDMARK_BY_ID[id]
          const active =
            highlightAll || Boolean(activeLandmarks?.includes(id))
          return (
            <div
              className={`environment-point environment-${option.side}${active ? ' is-active' : ' is-muted'}`}
              key={id}
            >
              <SurroundingIcon
                icon={option.icon}
                size={16}
                className={
                  option.icon === 'sunrise'
                    ? 'solar-icon sunrise-icon'
                    : option.icon === 'sunset'
                      ? 'solar-icon sunset-icon'
                      : undefined
                }
              />
              <span>
                <b>{option.label}</b>
                <small>{option.detail}</small>
              </span>
            </div>
          )
        })}
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
