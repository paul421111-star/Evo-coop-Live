import {
  Building2,
  Map,
  Route,
  Sunrise,
  Sunset,
  TreePine,
  Trees,
  Waves,
  type LucideProps,
} from 'lucide-react'
import type { ComponentType } from 'react'
import type { SurroundingIcon as IconName } from '../config/surroundings'

const ICONS: Record<IconName, ComponentType<LucideProps>> = {
  tree: TreePine,
  forest: Trees,
  building: Building2,
  sunrise: Sunrise,
  sunset: Sunset,
  park: Map,
  road: Route,
  water: Waves,
}

export function SurroundingIcon({
  icon,
  ...props
}: LucideProps & { icon: IconName }) {
  const Icon = ICONS[icon]
  return <Icon {...props} />
}
