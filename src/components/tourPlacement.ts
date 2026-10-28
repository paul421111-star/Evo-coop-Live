export type TourBox = { top: number; left: number; width: number; height: number }

export type TourPlacement = {
  focus: TourBox
  card: { top: number; left: number; width: number }
  side: 'below' | 'above' | 'inside'
}

const GAP = 18
const EDGE = 12
const FOCUS_PAD = 8

/**
 * Recorta o destaque à parte visível da tela e escolhe onde o cartão cabe.
 * Alvos maiores que a tela (o painel de apartamentos) ficam com o cartão
 * por cima, encostado na base, em vez de sair pelo topo.
 */
export function placeTourCard(
  target: { top: number; left: number; right: number; bottom: number },
  viewport: { width: number; height: number },
  cardHeight: number,
): TourPlacement {
  const top = Math.max(EDGE, target.top - FOCUS_PAD)
  const bottom = Math.min(viewport.height - EDGE, target.bottom + FOCUS_PAD)
  const left = Math.max(EDGE / 2, target.left - FOCUS_PAD)
  const right = Math.min(viewport.width - EDGE / 2, target.right + FOCUS_PAD)
  const focus = {
    top,
    left,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  }
  const width = Math.min(360, viewport.width - EDGE * 2)
  const cardLeft = Math.min(
    Math.max(EDGE, focus.left),
    Math.max(EDGE, viewport.width - width - EDGE),
  )
  if (viewport.height - bottom >= cardHeight + GAP + EDGE) {
    return { focus, side: 'below', card: { top: bottom + GAP, left: cardLeft, width } }
  }
  if (top >= cardHeight + GAP + EDGE) {
    return {
      focus,
      side: 'above',
      card: { top: top - GAP - cardHeight, left: cardLeft, width },
    }
  }
  return {
    focus,
    side: 'inside',
    card: {
      top: Math.max(EDGE, viewport.height - cardHeight - EDGE * 2),
      left: cardLeft,
      width,
    },
  }
}
