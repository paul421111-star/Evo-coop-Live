import {
  STATUS_BY_ID,
  STATUS_OPTIONS,
  apartmentStorageId,
  type ApartmentStatus,
  type BuildingConfig,
} from '../config/building'
import type { ApartmentAssignments, AuditEvent } from '../store/apartments'
import type { SurroundingsConfig } from '../config/surroundings'
import {
  DECLINE_REASON_BY_ID,
  DECLINE_SOURCE_BY_ID,
  type DrawDecline,
} from '../config/drawDeclines'

type ReportInput = {
  config: BuildingConfig
  statuses: Record<string, ApartmentStatus>
  assignments: ApartmentAssignments
  auditLog: AuditEvent[]
  surroundings: SurroundingsConfig
  declines?: DrawDecline[]
}

type Rgb = [number, number, number]
type Doc = import('jspdf').jsPDF & { lastAutoTable?: { finalY: number } }

const PAGE_WIDTH = 297
const PAGE_HEIGHT = 210
const MARGIN = 14
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2
const CONTENT_TOP = 32

const INK: Rgb = [15, 39, 48]
const TEAL: Rgb = [8, 126, 120]
const MUTED: Rgb = [110, 124, 138]
const LINE: Rgb = [214, 225, 232]
const ZEBRA: Rgb = [246, 249, 250]
const CARD: Rgb = [240, 247, 247]
const AMBER: Rgb = [176, 112, 8]
const SLATE: Rgb = [45, 67, 82]

const LOGO_URL = '/vida-nova-30-anos.png'
const LOGO_ASPECT = 392 / 208

function hexToRgb(hex: string): Rgb {
  const value = hex.replace('#', '')
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ]
}

function formatDateTime(value: Date) {
  return value.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** O logo vive em public/, então só existe quando o app roda no navegador. */
async function loadLogo() {
  try {
    const response = await fetch(LOGO_URL)
    if (!response.ok) return null
    const blob = await response.blob()
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () =>
        resolve(typeof reader.result === 'string' ? reader.result : null)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

type HeaderContext = {
  logo: string | null
  config: BuildingConfig
  generatedAt: Date
  filled: number
  total: number
}

function drawHeader(doc: Doc, context: HeaderContext) {
  const { logo, config, generatedAt, filled, total } = context

  if (logo) {
    const height = 13
    doc.addImage(logo, 'PNG', MARGIN, 8, height * LOGO_ASPECT, height)
  }

  const textLeft = logo ? MARGIN + 13 * LOGO_ASPECT + 8 : MARGIN
  doc.setDrawColor(...LINE)
  doc.setLineWidth(0.3)
  doc.line(textLeft - 5, 9, textLeft - 5, 21)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.setTextColor(...INK)
  doc.text('Relatório do sorteio', textLeft, 15)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(...MUTED)
  doc.text(`${config.label} · ${config.description}`, textLeft, 20.5)

  const percentage = total ? Math.round((filled / total) * 100) : 0
  doc.text(`Gerado em ${formatDateTime(generatedAt)}`, PAGE_WIDTH - MARGIN, 13, {
    align: 'right',
  })
  doc.text(
    `${filled} de ${total} unidades preenchidas · ${percentage}%`,
    PAGE_WIDTH - MARGIN,
    18.5,
    { align: 'right' },
  )

  doc.setDrawColor(...TEAL)
  doc.setLineWidth(0.6)
  doc.line(MARGIN, 25.5, PAGE_WIDTH - MARGIN, 25.5)
}

function drawFooters(doc: Doc) {
  const pages = doc.getNumberOfPages()
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page)
    doc.setDrawColor(...LINE)
    doc.setLineWidth(0.3)
    doc.line(MARGIN, PAGE_HEIGHT - 13, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 13)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...MUTED)
    doc.text(
      'Cooperativa Habitacional Vida Nova · Documento gerado automaticamente',
      MARGIN,
      PAGE_HEIGHT - 8,
    )
    doc.text(
      `Página ${page} de ${pages}`,
      PAGE_WIDTH - MARGIN,
      PAGE_HEIGHT - 8,
      { align: 'right' },
    )
  }
}

function drawKpiCards(
  doc: Doc,
  y: number,
  cards: Array<{ label: string; value: number }>,
) {
  const gap = 4
  const width = (CONTENT_WIDTH - gap * (cards.length - 1)) / cards.length
  const height = 17

  cards.forEach((card, index) => {
    const x = MARGIN + index * (width + gap)
    doc.setFillColor(...CARD)
    doc.setDrawColor(...LINE)
    doc.setLineWidth(0.2)
    doc.roundedRect(x, y, width, height, 1.8, 1.8, 'FD')

    doc.setFillColor(...TEAL)
    doc.roundedRect(x, y, 1.4, height, 0.7, 0.7, 'F')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6.6)
    doc.setTextColor(...MUTED)
    doc.text(card.label.toUpperCase(), x + 5, y + 6)

    doc.setFontSize(15)
    doc.setTextColor(...INK)
    doc.text(String(card.value), x + 5, y + 13.5)
  })

  return y + height
}

function drawStatusLegend(
  doc: Doc,
  y: number,
  counts: Record<ApartmentStatus, number>,
) {
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)

  let x = MARGIN
  STATUS_OPTIONS.forEach((status) => {
    const text = `${status.label}: ${counts[status.id] ?? 0}`
    const width = doc.getTextWidth(text) + 9

    doc.setFillColor(...hexToRgb(status.color))
    doc.circle(x + 3, y + 2.6, 1.3, 'F')
    doc.setTextColor(...INK)
    doc.text(text, x + 6, y + 3.6)
    x += width + 4
  })

  return y + 7
}

function drawSectionHeading(doc: Doc, y: number, title: string, note: string) {
  doc.setFillColor(...TEAL)
  doc.rect(MARGIN, y - 3.2, 1.8, 4.6, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...INK)
  doc.text(title, MARGIN + 4.5, y)

  if (note) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...MUTED)
    doc.text(note, PAGE_WIDTH - MARGIN, y, { align: 'right' })
  }

  return y + 4
}

function drawEmptyState(doc: Doc, y: number, message: string) {
  doc.setFillColor(...ZEBRA)
  doc.setDrawColor(...LINE)
  doc.setLineWidth(0.2)
  doc.roundedRect(MARGIN, y, CONTENT_WIDTH, 11, 1.6, 1.6, 'FD')

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...MUTED)
  doc.text(message, MARGIN + 5, y + 6.8)

  return y + 11
}

export async function generateBuildingPdf({
  config,
  statuses,
  assignments,
  auditLog,
  surroundings,
  declines = [],
}: ReportInput) {
  const [{ jsPDF }, { default: autoTable }, logo] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    loadLogo(),
  ])

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm' }) as Doc
  const generatedAt = new Date()
  const total = config.apartments.length
  const filled = config.apartments.filter(
    ({ id }) => statuses[id] !== 'none',
  ).length
  const buildingDeclines = declines.filter(
    (item) => item.building === config.kind,
  )
  const buildingAudit = auditLog.filter(({ apartmentId }) =>
    apartmentId.startsWith(`${config.kind}:`),
  )

  const statusCounts = STATUS_OPTIONS.reduce(
    (accumulator, status) => ({ ...accumulator, [status.id]: 0 }),
    {} as Record<ApartmentStatus, number>,
  )
  config.apartments.forEach(({ id }) => {
    const status = statuses[id] ?? 'none'
    statusCounts[status] += 1
  })

  doc.setProperties({
    title: `Relatório do sorteio · ${config.label}`,
    subject: 'Mapa comercial e Lista de Abdicação',
    author: 'Cooperativa Habitacional Vida Nova',
    creator: 'Evo Coop Live',
  })

  const headerContext: HeaderContext = {
    logo,
    config,
    generatedAt,
    filled,
    total,
  }
  const pageDecoration = () => drawHeader(doc, headerContext)
  pageDecoration()

  let cursor = drawKpiCards(doc, CONTENT_TOP, [
    { label: 'Total de unidades', value: total },
    { label: 'Escolhidos', value: filled },
    { label: 'Livres', value: total - filled },
    { label: 'Abdicações', value: buildingDeclines.length },
    {
      label: 'Por sorteio',
      value: buildingDeclines.filter((item) => item.source === 'draw').length,
    },
    {
      label: 'Por antecipador',
      value: buildingDeclines.filter((item) => item.source === 'anticipator')
        .length,
    },
  ])

  cursor = drawStatusLegend(doc, cursor + 5, statusCounts)
  cursor = drawSectionHeading(
    doc,
    cursor + 6,
    'Mapa de unidades',
    `${total} apartamentos · do andar mais alto para o térreo`,
  )

  const units = [...config.apartments].sort(
    (a, b) => b.floor - a.floor || a.ending - b.ending,
  )
  const unitStatusColors = units.map(({ id }) =>
    hexToRgb(STATUS_BY_ID[statuses[id] ?? 'none'].color),
  )

  autoTable(doc, {
    startY: cursor + 1,
    head: [
      [
        'Apartamento',
        'Andar',
        'Final',
        'Situação',
        'Bolinha / cota',
        'Participante',
        'Incluído por',
        'Alterado por',
        'Indicações',
      ],
    ],
    body: units.map((apartment) => {
      const assignment =
        assignments[apartmentStorageId(config.kind, apartment.id)]
      return [
        apartment.id,
        apartment.floor === 0 ? 'Térreo' : `${apartment.floor}º`,
        String(apartment.ending),
        STATUS_BY_ID[statuses[apartment.id] ?? 'none'].label,
        assignment?.ball || '—',
        assignment?.participant || '—',
        assignment?.createdBy || '—',
        assignment?.updatedBy || '—',
        (surroundings[config.kind][apartment.ending] ?? [])
          .map(({ label }) => label)
          .join(', ') || '—',
      ]
    }),
    theme: 'plain',
    styles: {
      fontSize: 6.9,
      cellPadding: { top: 1.4, bottom: 1.4, left: 2.4, right: 2.4 },
      textColor: INK,
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: TEAL,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7,
      cellPadding: { top: 2, bottom: 2, left: 2.4, right: 2.4 },
    },
    alternateRowStyles: { fillColor: ZEBRA },
    columnStyles: {
      0: { cellWidth: 22, fontStyle: 'bold' },
      1: { cellWidth: 15 },
      2: { cellWidth: 12 },
      3: {
        cellWidth: 29,
        cellPadding: { top: 1.4, bottom: 1.4, left: 7, right: 2.4 },
      },
      4: { cellWidth: 22 },
      5: { cellWidth: 47 },
      6: { cellWidth: 27 },
      7: { cellWidth: 27 },
      8: { cellWidth: 68, textColor: MUTED },
    },
    margin: { left: MARGIN, right: MARGIN, top: CONTENT_TOP },
    didDrawPage: pageDecoration,
    didDrawCell: (data) => {
      if (data.section !== 'body' || data.column.index !== 3) return
      const color = unitStatusColors[data.row.index]
      if (!color) return
      doc.setFillColor(...color)
      doc.circle(
        data.cell.x + 3.6,
        data.cell.y + data.cell.height / 2,
        1.2,
        'F',
      )
    },
  })

  cursor = (doc.lastAutoTable?.finalY ?? cursor) + 10
  if (cursor > PAGE_HEIGHT - 45) {
    doc.addPage()
    pageDecoration()
    cursor = CONTENT_TOP + 2
  }

  cursor = drawSectionHeading(
    doc,
    cursor,
    'Lista de Abdicação',
    `${buildingDeclines.length} ${buildingDeclines.length === 1 ? 'registro' : 'registros'}`,
  )

  if (buildingDeclines.length) {
    autoTable(doc, {
      startY: cursor + 1,
      head: [
        [
          'Bolinha / cota',
          'Participante',
          'Origem',
          'Motivo',
          'Observação',
          'Registrado por',
          'Data',
        ],
      ],
      body: buildingDeclines.map((item) => [
        item.ball,
        item.participant || '—',
        DECLINE_SOURCE_BY_ID[item.source],
        DECLINE_REASON_BY_ID[item.reason],
        item.notes || '—',
        item.createdBy,
        formatDateTime(new Date(item.createdAt)),
      ]),
      theme: 'plain',
      styles: {
        fontSize: 7.2,
        cellPadding: { top: 1.9, bottom: 1.9, left: 2.4, right: 2.4 },
        textColor: INK,
        overflow: 'linebreak',
      },
      headStyles: {
        fillColor: AMBER,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 7.2,
      },
      alternateRowStyles: { fillColor: ZEBRA },
      columnStyles: {
        0: { cellWidth: 26, fontStyle: 'bold' },
        1: { cellWidth: 52 },
        2: { cellWidth: 26 },
        3: { cellWidth: 44 },
        4: { cellWidth: 55, textColor: MUTED },
        5: { cellWidth: 36 },
        6: { cellWidth: 30 },
      },
      margin: { left: MARGIN, right: MARGIN, top: CONTENT_TOP },
      didDrawPage: pageDecoration,
    })
    cursor = (doc.lastAutoTable?.finalY ?? cursor) + 10
  } else {
    cursor = drawEmptyState(doc, cursor + 1, 'Nenhuma abdicação registrada nesta torre.') + 10
  }

  if (cursor > PAGE_HEIGHT - 45) {
    doc.addPage()
    pageDecoration()
    cursor = CONTENT_TOP + 2
  }

  cursor = drawSectionHeading(
    doc,
    cursor,
    'Histórico de movimentações',
    `${buildingAudit.length} ${buildingAudit.length === 1 ? 'evento' : 'eventos'}`,
  )

  if (buildingAudit.length) {
    autoTable(doc, {
      startY: cursor + 1,
      head: [['Ação', 'Apartamento', 'Usuário', 'Data', 'Justificativa']],
      body: buildingAudit
        .slice()
        .reverse()
        .map((event) => [
          event.action === 'created'
            ? 'Inclusão'
            : event.action === 'updated'
              ? 'Alteração'
              : event.action === 'imported'
                ? 'Importação'
                : 'Remoção',
          event.apartmentId.split(':')[1],
          event.actor,
          formatDateTime(new Date(event.timestamp)),
          event.reason || '—',
        ]),
      theme: 'plain',
      styles: {
        fontSize: 7.2,
        cellPadding: { top: 1.9, bottom: 1.9, left: 2.4, right: 2.4 },
        textColor: INK,
        overflow: 'linebreak',
      },
      headStyles: {
        fillColor: SLATE,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 7.2,
      },
      alternateRowStyles: { fillColor: ZEBRA },
      columnStyles: {
        0: { cellWidth: 28, fontStyle: 'bold' },
        1: { cellWidth: 28 },
        2: { cellWidth: 42 },
        3: { cellWidth: 34 },
        4: { cellWidth: 137, textColor: MUTED },
      },
      margin: { left: MARGIN, right: MARGIN, top: CONTENT_TOP },
      didDrawPage: pageDecoration,
    })
  } else {
    drawEmptyState(doc, cursor + 1, 'Nenhuma movimentação registrada nesta torre.')
  }

  drawFooters(doc)

  const slug = config.label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
  doc.save(
    `relatorio-sorteio-${slug}-${generatedAt.toISOString().slice(0, 10)}.pdf`,
  )
}
