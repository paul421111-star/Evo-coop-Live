type UnitBox = {
  x: number
  z: number
  width: number
  depth: number
}

/** Deslocamento da chave até o canto da sacada, fora do meio da janela. */
export function balconyKeyOffset(position: UnitBox) {
  const facesX = Math.abs(position.x) >= Math.abs(position.z)
  const outwardSign = Math.sign(facesX ? position.x : position.z) || 1
  const lateralSign = Math.sign(facesX ? position.z : position.x) || 1
  const along = Math.min((facesX ? position.width : position.depth) / 2 - 1.2, 4.2)
  const side = (facesX ? position.depth : position.width) / 2 + 0.45

  return {
    x: facesX ? outwardSign * along : lateralSign * side,
    z: facesX ? lateralSign * side : outwardSign * along,
    facadeNormal: {
      x: facesX ? outwardSign : 0,
      z: facesX ? 0 : outwardSign,
    },
    balconyNormal: {
      x: facesX ? 0 : lateralSign,
      z: facesX ? lateralSign : 0,
    },
  }
}
