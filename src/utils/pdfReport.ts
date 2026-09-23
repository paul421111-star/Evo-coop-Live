import {
  STATUS_BY_ID,
  apartmentStorageId,
  type ApartmentStatus,
  type BuildingConfig,
} from '../config/building'
import type { ApartmentAssignments, AuditEvent } from '../store/apartments'
import type { SurroundingsConfig } from '../config/surroundings'

type ReportInput = {
  config: BuildingConfig
  statuses: Record<string, ApartmentStatus>
  assignments: ApartmentAssignments
  auditLog: AuditEvent[]
  surroundings: SurroundingsConfig
}

export async function generateBuildingPdf({
  config,
  statuses,
  assignments,
  auditLog,
  surroundings,
}: ReportInput) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ])
  const document = new jsPDF({ orientation: 'landscape', unit: 'mm' })
  const generatedAt = new Date()
  const filled = config.apartments.filter(
    ({ id }) => statuses[id] !== 'none',
  ).length

  document.setFontSize(18)
  document.text('Evo Coop Live - Relatorio do sorteio', 14, 18)
  document.setFontSize(11)
  document.text(config.label, 14, 26)
  document.setTextColor(90)
  document.text(
    `Gerado em ${generatedAt.toLocaleString('pt-BR')} | ${filled}/${config.apartments.length} unidades preenchidas`,
    14,
    33,
  )
  document.setTextColor(0)

  autoTable(document, {
    startY: 40,
    head: [[
      'Apartamento',
      'Andar',
      'Final',
      'Situacao',
      'Bolinha',
      'Sorteado',
      'Incluido por',
      'Alterado por',
      'Indicacoes',
    ]],
    body: [...config.apartments]
      .sort((a, b) => b.floor - a.floor || a.ending - b.ending)
      .map((apartment) => {
        const assignment =
          assignments[apartmentStorageId(config.kind, apartment.id)]
        return [
          apartment.id,
          `${apartment.floor}o`,
          String(apartment.ending),
          STATUS_BY_ID[statuses[apartment.id] ?? 'none'].label,
          assignment?.ball ?? '-',
          assignment?.participant || '-',
          assignment?.createdBy || '-',
          assignment?.updatedBy || '-',
          (surroundings[config.kind][apartment.ending] ?? [])
            .map(({ label }) => label)
            .join(', ') || '-',
        ]
      }),
    styles: { fontSize: 7, cellPadding: 1.7 },
    headStyles: { fillColor: [8, 126, 120] },
    alternateRowStyles: { fillColor: [244, 247, 249] },
    margin: { left: 14, right: 14 },
  })

  const buildingAudit = auditLog.filter(({ apartmentId }) =>
    apartmentId.startsWith(`${config.kind}:`),
  )
  if (buildingAudit.length) {
    const tableDocument = document as typeof document & {
      lastAutoTable?: { finalY: number }
    }
    autoTable(document, {
      startY: (tableDocument.lastAutoTable?.finalY ?? 40) + 10,
      head: [['Historico', 'Apartamento', 'Usuario', 'Data', 'Justificativa']],
      body: buildingAudit
        .slice()
        .reverse()
        .map((event) => [
          event.action === 'created'
            ? 'Inclusao'
            : event.action === 'updated'
              ? 'Alteracao'
              : event.action === 'imported'
                ? 'Importacao'
                : 'Remocao',
          event.apartmentId.split(':')[1],
          event.actor,
          new Date(event.timestamp).toLocaleString('pt-BR'),
          event.reason || '-',
        ]),
      styles: { fontSize: 7, cellPadding: 1.7 },
      headStyles: { fillColor: [45, 67, 82] },
      margin: { left: 14, right: 14 },
    })
  }

  const pages = document.getNumberOfPages()
  for (let page = 1; page <= pages; page += 1) {
    document.setPage(page)
    document.setFontSize(8)
    document.setTextColor(120)
    document.text(
      `Pagina ${page} de ${pages}`,
      document.internal.pageSize.getWidth() - 14,
      document.internal.pageSize.getHeight() - 8,
      { align: 'right' },
    )
  }

  const kind = config.kind === 'odd' ? 'grupos-impares' : 'grupos-pares'
  document.save(
    `evo-coop-live-${kind}-${generatedAt.toISOString().slice(0, 10)}.pdf`,
  )
}
