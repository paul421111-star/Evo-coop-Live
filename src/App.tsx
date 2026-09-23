import { useMemo, useRef, useState } from 'react'
import {
  Building2,
  Check,
  ChevronDown,
  Download,
  Eraser,
  Eye,
  Filter,
  Layers3,
  RotateCcw,
  Trash2,
  Undo2,
  Upload,
} from 'lucide-react'
import { ApartmentGrid } from './components/ApartmentGrid'
import { BuildingScene, type BuildingView } from './components/BuildingScene'
import {
  APARTMENT_BY_ID,
  APARTMENTS,
  ENDINGS,
  ENDING_MAP,
  FLOOR_COUNT,
  STATUS_BY_ID,
  STATUS_OPTIONS,
  apartmentId,
  type ApartmentStatus,
  type Ending,
} from './config/building'
import {
  normalizeStatuses,
  useApartmentStore,
  type ApartmentStatuses,
} from './store/apartments'
import './styles.css'

const VIEW_OPTIONS: Array<{ id: BuildingView; label: string }> = [
  { id: 'perspective', label: '3D' },
  { id: 'front', label: 'Frente' },
  { id: 'back', label: 'Fundos' },
  { id: 'east', label: 'Leste' },
  { id: 'west', label: 'Oeste' },
]

function App() {
  const statuses = useApartmentStore((state) => state.statuses)
  const history = useApartmentStore((state) => state.history)
  const setStatus = useApartmentStore((state) => state.setStatus)
  const replaceStatuses = useApartmentStore((state) => state.replaceStatuses)
  const clearAll = useApartmentStore((state) => state.clearAll)
  const undo = useApartmentStore((state) => state.undo)

  const [selectedId, setSelectedId] = useState('3601')
  const [activeStatus, setActiveStatus] = useState<ApartmentStatus>('available')
  const [view, setView] = useState<BuildingView>('perspective')
  const [floorFilter, setFloorFilter] = useState<number | 'all'>('all')
  const [endingFilter, setEndingFilter] = useState<Ending | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<ApartmentStatus | 'all'>('all')
  const [notice, setNotice] = useState('')
  const importInput = useRef<HTMLInputElement>(null)

  const selectedApartment = APARTMENT_BY_ID[selectedId]
  const selectedStatus = statuses[selectedId] ?? 'none'

  const counts = useMemo(
    () =>
      Object.fromEntries(
        STATUS_OPTIONS.map(({ id }) => [
          id,
          Object.values(statuses).filter((status) => status === id).length,
        ]),
      ) as Record<ApartmentStatus, number>,
    [statuses],
  )

  const filledCount = APARTMENTS.length - counts.none
  const progress = Math.round((filledCount / APARTMENTS.length) * 100)

  const showNotice = (message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 2600)
  }

  const paintApartment = (id: string) => {
    setSelectedId(id)
    setStatus([id], activeStatus)
  }

  const applyToFloor = () => {
    if (!selectedApartment) return
    setStatus(
      ENDINGS.map((ending) => apartmentId(selectedApartment.floor, ending)),
      activeStatus,
    )
    showNotice(`${selectedApartment.floor}º andar atualizado`)
  }

  const applyToEnding = () => {
    if (!selectedApartment) return
    setStatus(
      APARTMENTS.filter(({ ending }) => ending === selectedApartment.ending).map(
        ({ id }) => id,
      ),
      activeStatus,
    )
    showNotice(`Final ${selectedApartment.ending} atualizado`)
  }

  const exportData = () => {
    const payload = JSON.stringify(
      {
        version: 1,
        building: 'grupo-15-parque-firenze',
        exportedAt: new Date().toISOString(),
        statuses,
      },
      null,
      2,
    )
    const url = URL.createObjectURL(
      new Blob([payload], { type: 'application/json;charset=utf-8' }),
    )
    const link = document.createElement('a')
    link.href = url
    link.download = `mapa-g15-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
    showNotice('Arquivo exportado')
  }

  const importData = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as {
        statuses?: unknown
      }
      const normalized = normalizeStatuses(parsed.statuses ?? parsed)
      if (!normalized) throw new Error('Formato inválido')
      if (
        !window.confirm(
          'Importar este mapa substituirá as marcações atuais. Deseja continuar?',
        )
      ) {
        return
      }
      replaceStatuses(normalized as ApartmentStatuses)
      showNotice('Mapa importado com sucesso')
    } catch {
      showNotice('Não foi possível importar o arquivo')
    } finally {
      if (importInput.current) importInput.current.value = ''
    }
  }

  const requestClear = () => {
    if (filledCount === 0) return
    if (window.confirm('Remover todas as marcações do mapa?')) {
      clearAll()
      showNotice('Mapa limpo')
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">
            <Building2 size={20} strokeWidth={2.2} />
          </span>
          <div>
            <strong>Parque Firenze</strong>
            <span>Mapa comercial · Grupo 15</span>
          </div>
        </div>

        <div className="header-summary" aria-label="Resumo do mapa">
          <div>
            <span>Preenchimento</span>
            <strong>
              {filledCount} <small>/ {APARTMENTS.length}</small>
            </strong>
          </div>
          <div className="progress-ring" style={{ '--progress': `${progress * 3.6}deg` } as React.CSSProperties}>
            <span>{progress}%</span>
          </div>
        </div>

        <div className="file-actions">
          <input
            ref={importInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void importData(file)
            }}
          />
          <button type="button" className="ghost-button" onClick={() => importInput.current?.click()}>
            <Upload size={16} /> <span>Importar</span>
          </button>
          <button type="button" className="ghost-button" onClick={exportData}>
            <Download size={16} /> <span>Exportar</span>
          </button>
        </div>
      </header>

      <main className="workspace">
        <section className="viewer-card" aria-label="Visualização 3D do edifício">
          <div className="viewer-toolbar">
            <div className="view-tabs">
              {VIEW_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={view === option.id ? 'active' : ''}
                  onClick={() => setView(option.id)}
                >
                  {option.id === 'perspective' && <RotateCcw size={14} />}
                  {option.label}
                </button>
              ))}
            </div>
            <span className="viewer-hint">
              <Eye size={14} /> Arraste para girar · role para zoom
            </span>
          </div>

          <div className="canvas-wrap">
            <BuildingScene
              statuses={statuses}
              selectedId={selectedId}
              activeStatus={activeStatus}
              view={view}
              onSelect={paintApartment}
            />
            <div className="orientation-badge">
              <span>N</span>
              <i />
            </div>
            <div className="scene-counter">
              <Layers3 size={15} />
              <span>36 andares</span>
              <b>·</b>
              <span>144 unidades</span>
            </div>
          </div>
        </section>

        <aside className="control-panel">
          <section className="panel-section palette-section">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Pincel ativo</span>
                <h2>Defina a situação</h2>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => {
                  setActiveStatus('none')
                  setStatus([selectedId], 'none')
                }}
                title="Apagar marcação selecionada"
              >
                <Eraser size={17} />
              </button>
            </div>
            <div className="status-palette">
              {STATUS_OPTIONS.filter(({ id }) => id !== 'none').map((status) => (
                <button
                  type="button"
                  key={status.id}
                  className={activeStatus === status.id ? 'active' : ''}
                  onClick={() => setActiveStatus(status.id)}
                  style={{ '--status-color': status.color } as React.CSSProperties}
                >
                  <span className="color-swatch">
                    {activeStatus === status.id && <Check size={12} />}
                  </span>
                  <span>{status.label}</span>
                  <small>{counts[status.id]}</small>
                </button>
              ))}
            </div>
          </section>

          <section className="panel-section selection-card">
            <span className="eyebrow">Unidade selecionada</span>
            <div className="selection-title">
              <div>
                <span>Apartamento</span>
                <strong>{selectedId}</strong>
              </div>
              <span
                className="status-chip"
                style={{ '--status-color': STATUS_BY_ID[selectedStatus].color } as React.CSSProperties}
              >
                {STATUS_BY_ID[selectedStatus].label}
              </span>
            </div>
            <div className="selection-meta">
              <span>
                <b>{selectedApartment?.floor}º</b> andar
              </span>
              <span>
                <b>Final {selectedApartment?.ending}</b>{' '}
                {selectedApartment && ENDING_MAP[selectedApartment.ending].shortLabel}
              </span>
            </div>
            <div className="bulk-actions">
              <button type="button" onClick={applyToFloor}>
                Aplicar ao andar
              </button>
              <button type="button" onClick={applyToEnding}>
                Aplicar ao final
              </button>
            </div>
          </section>

          <section className="panel-section filters-section">
            <div className="section-heading compact">
              <h2>
                <Filter size={16} /> Filtros
              </h2>
              {(floorFilter !== 'all' ||
                endingFilter !== 'all' ||
                statusFilter !== 'all') && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setFloorFilter('all')
                    setEndingFilter('all')
                    setStatusFilter('all')
                  }}
                >
                  Limpar
                </button>
              )}
            </div>
            <div className="filter-row">
              <label>
                <span>Andar</span>
                <div className="select-wrap">
                  <select
                    value={floorFilter}
                    onChange={(event) =>
                      setFloorFilter(
                        event.target.value === 'all' ? 'all' : Number(event.target.value),
                      )
                    }
                  >
                    <option value="all">Todos</option>
                    {Array.from({ length: FLOOR_COUNT }, (_, index) => FLOOR_COUNT - index).map(
                      (floor) => (
                        <option key={floor} value={floor}>
                          {floor}º
                        </option>
                      ),
                    )}
                  </select>
                  <ChevronDown size={14} />
                </div>
              </label>
              <label>
                <span>Final</span>
                <div className="select-wrap">
                  <select
                    value={endingFilter}
                    onChange={(event) =>
                      setEndingFilter(
                        event.target.value === 'all'
                          ? 'all'
                          : (Number(event.target.value) as Ending),
                      )
                    }
                  >
                    <option value="all">Todos</option>
                    {ENDINGS.map((ending) => (
                      <option key={ending} value={ending}>
                        Final {ending}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} />
                </div>
              </label>
              <label>
                <span>Situação</span>
                <div className="select-wrap">
                  <select
                    value={statusFilter}
                    onChange={(event) =>
                      setStatusFilter(event.target.value as ApartmentStatus | 'all')
                    }
                  >
                    <option value="all">Todas</option>
                    {STATUS_OPTIONS.map((status) => (
                      <option key={status.id} value={status.id}>
                        {status.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} />
                </div>
              </label>
            </div>
          </section>

          <ApartmentGrid
            statuses={statuses}
            selectedId={selectedId}
            floorFilter={floorFilter}
            endingFilter={endingFilter}
            statusFilter={statusFilter}
            onSelect={paintApartment}
          />

          <div className="panel-footer">
            <button type="button" className="footer-action" onClick={undo} disabled={!history.length}>
              <Undo2 size={15} /> Desfazer
            </button>
            <button type="button" className="footer-action danger" onClick={requestClear}>
              <Trash2 size={15} /> Limpar mapa
            </button>
          </div>
        </aside>
      </main>

      {notice && <div className="toast">{notice}</div>}
    </div>
  )
}

export default App

