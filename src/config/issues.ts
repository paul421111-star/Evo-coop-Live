export type IssueKind = 'falha' | 'melhoria'
export type IssuePriority = 'baixa' | 'media' | 'alta'
export type IssueStage = 'backlog' | 'doing' | 'done'

export type ProductIssue = {
  id: string
  number: number
  title: string
  kind: IssueKind
  priority: IssuePriority
  stage: IssueStage
  context: string
  expected: string
  place: string
  authorName: string
  createdAt: string
  updatedAt: string
}

export type IssueInput = {
  title: string
  kind: IssueKind
  priority: IssuePriority
  context: string
  expected: string
  place: string
}

export const ISSUE_KIND_LABEL: Record<IssueKind, string> = {
  falha: 'Falha',
  melhoria: 'Melhoria',
}

export const ISSUE_PRIORITY_LABEL: Record<IssuePriority, string> = {
  baixa: 'Baixa',
  media: 'Média',
  alta: 'Alta',
}

export const ISSUE_STAGE_LABEL: Record<IssueStage, string> = {
  backlog: 'Backlog',
  doing: 'Em desenvolvimento',
  done: 'Concluído',
}
