type Props = {
  /** `dark` para fundos escuros, `light` para fundos claros. */
  tone?: 'dark' | 'light'
  /** Fixa no canto da tela sem ocupar espaço no layout. */
  floating?: boolean
}

export const COPYRIGHT_TEXT = `© ${new Date().getFullYear()} PCB. Todos os direitos reservados.`

export function SiteFooter({ tone = 'light', floating = false }: Props) {
  return (
    <footer
      className={`site-footer is-${tone}${floating ? ' is-floating' : ''}`}
    >
      <small>{COPYRIGHT_TEXT}</small>
    </footer>
  )
}
