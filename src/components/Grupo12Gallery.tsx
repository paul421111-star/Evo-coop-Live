import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'

const PHOTOS = [
  {
    src: 'https://chvn.com.br/wp-content/uploads/2026/09/12-2.png',
    title: 'Vista aérea · 2026',
  },
  {
    src: 'https://chvn.com.br/wp-content/uploads/2022/10/2DORM.-LIVING-01.jpg',
    title: 'Living (ilustrativo)',
  },
  {
    src: 'https://chvn.com.br/wp-content/uploads/2022/10/2DORM.-LIVING-02.jpg',
    title: 'Living (ilustrativo)',
  },
  {
    src: 'https://chvn.com.br/wp-content/uploads/2022/11/PLANTA_2dorm-_comum.jpg',
    title: 'Planta · 2 dormitórios',
  },
  {
    src: 'https://chvn.com.br/wp-content/uploads/2022/11/PLANTA_2dorm_dependencia.jpg',
    title: 'Planta · 2 dorm. com dependência',
  },
]

export function Grupo12Gallery() {
  const [open, setOpen] = useState<(typeof PHOTOS)[number] | null>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <section className="g12-gallery" aria-label="Galeria do Grupo 12">
      <header className="g12-gallery-head">
        <h2>Galeria do Grupo 12</h2>
        <p>3 fotos e 2 plantas. Clique para ampliar.</p>
      </header>
      <div className="g12-gallery-grid">
        {PHOTOS.map((photo) => (
          <GalleryCard
            key={photo.src}
            title={photo.title}
            src={photo.src}
            onOpen={() => setOpen(photo)}
          />
        ))}
      </div>
      {open && (
        <div
          className="g12-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={open.title}
          onClick={() => setOpen(null)}
        >
          <figure onClick={(event) => event.stopPropagation()}>
            <img src={open.src} alt={open.title} />
            <figcaption>{open.title}</figcaption>
            <button type="button" onClick={() => setOpen(null)} aria-label="Fechar">
              <X size={18} />
            </button>
          </figure>
        </div>
      )}
    </section>
  )
}

function GalleryCard({
  src,
  title,
  onOpen,
}: {
  src: string
  title: string
  onOpen: () => void
}) {
  const [shown, setShown] = useState(false)
  const cardRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    const node = cardRef.current
    if (!node) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(true)
      return
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return
        setShown(true)
        observer.disconnect()
      },
      { threshold: 0.22 },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <button
      type="button"
      ref={cardRef}
      className={`g12-card${shown ? ' is-shown' : ''}`}
      onClick={onOpen}
    >
      <img src={src} alt="" />
      <span>{title}</span>
    </button>
  )
}
