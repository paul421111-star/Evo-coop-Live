function brazilDigits(digits: string) {
  const local =
    digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits
  return local.slice(0, 11)
}

function formatBrazilTyping(digits: string) {
  const local = brazilDigits(digits)
  if (!local) return ''
  if (local.length < 2) return `(${local}`
  const ddd = local.slice(0, 2)
  const rest = local.slice(2)
  if (rest.length <= 4) return `(${ddd}) ${rest}`
  if (local.length <= 10) {
    return `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`
  }
  return `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`
}

function groupInternational(digits: string) {
  let rest = digits.slice(0, 15)
  if (rest.startsWith('1')) {
    const local = rest.slice(1, 11)
    const parts = ['1']
    if (local) parts.push(local.slice(0, 3))
    if (local.length > 3) parts.push(local.slice(3, 6))
    if (local.length > 6) parts.push(local.slice(6, 10))
    return parts.filter(Boolean).join(' ')
  }
  const chunks: string[] = [rest.slice(0, Math.min(3, rest.length))]
  rest = rest.slice(chunks[0]?.length ?? 0)
  while (rest) {
    chunks.push(rest.slice(0, 3))
    rest = rest.slice(3)
  }
  return chunks.filter(Boolean).join(' ')
}

/** Máscara enquanto a pessoa digita. Com + (ou 00), o número é de outro país. */
export function formatWhatsappInput(raw: string) {
  const trimmed = raw.trimStart()
  const international = trimmed.startsWith('+') || trimmed.startsWith('00')
  if (international) {
    let digits = raw.replace(/\D/g, '')
    if (trimmed.startsWith('00')) digits = digits.slice(2)
    if (!digits) return '+'
    return `+${groupInternational(digits)}`
  }
  return formatBrazilTyping(raw.replace(/\D/g, ''))
}

export function phoneFieldValue(raw: string, selectionStart: number | null) {
  const caret = selectionStart ?? raw.length
  const digitsBefore = raw.slice(0, caret).replace(/\D/g, '').length
  const formatted = formatWhatsappInput(raw)
  return { value: formatted, caret: nextPhoneCaret(formatted, digitsBefore) }
}

export function nextPhoneCaret(formatted: string, digitsBeforeCaret: number) {
  if (digitsBeforeCaret <= 0) return formatted.startsWith('+') ? 1 : 0
  let seen = 0
  for (let index = 0; index < formatted.length; index += 1) {
    if (/\d/.test(formatted[index] ?? '')) {
      seen += 1
      if (seen >= digitsBeforeCaret) return index + 1
    }
  }
  return formatted.length
}

export function formatWhatsappPhone(phone: string) {
  const digits = phone.replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    return formatBrazilTyping(digits)
  }
  if (digits.length >= 8 && digits.length <= 15) {
    return `+${groupInternational(digits)}`
  }
  return formatBrazilTyping(digits)
}

export function formatBrazilPhone(phone: string) {
  return formatWhatsappPhone(phone)
}

/** Dígitos no padrão do WhatsApp. Brasil ganha 55; outro país precisa do + ou do 00. */
export function normalizeWhatsappPhone(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  const international = trimmed.startsWith('+') || trimmed.startsWith('00')
  let digits = trimmed.replace(/\D/g, '')
  if (trimmed.startsWith('00')) digits = digits.slice(2)
  if (!digits) return null
  if (international) {
    if (digits.length < 8 || digits.length > 15) return null
    return digits
  }
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    return digits
  }
  if (digits.length === 10 || digits.length === 11) return `55${digits}`
  if (digits.length >= 12 && digits.length <= 15) return digits
  return null
}

export function normalizeBrazilPhone(input: string): string | null {
  return normalizeWhatsappPhone(input)
}

/** Número já gravado, sem acrescentar 55 de novo. */
export function storedWhatsappPhone(value: string | null | undefined) {
  const digits = String(value ?? '').replace(/\D/g, '')
  if (digits.length < 8 || digits.length > 15) return null
  return digits
}

export function anticipationAmount(
  installments: number,
  installmentValue: number,
) {
  return Math.round(installments * installmentValue * 100) / 100
}

export function formatMoney(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function anticipationMessage(input: {
  participant: string
  associateCode: string
  installments: number
  installmentValue: number
}) {
  const amount = anticipationAmount(
    input.installments,
    input.installmentValue,
  )
  const name = input.participant.trim() || 'associado'
  const parcelas = `${input.installments} parcela${input.installments === 1 ? '' : 's'}`
  return [
    'Cooperativa Habitacional Vida Nova',
    'Departamento de Cobrança',
    '',
    `Olá, ${name}.`,
    `Contrato ${input.associateCode}.`,
    `Sua antecipação foi confirmada: ${parcelas}.`,
    `${parcelas} × ${formatMoney(input.installmentValue)} = ${formatMoney(amount)}.`,
    `Valor da antecipação: ${formatMoney(amount)}.`,
  ].join('\n')
}
