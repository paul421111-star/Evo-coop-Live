import { describe, expect, it } from 'vitest'
import {
  anticipationAmount,
  anticipationMessage,
  formatWhatsappInput,
  formatWhatsappPhone,
  normalizeBrazilPhone,
  normalizeWhatsappPhone,
} from './collectionNotice'

describe('aviso de antecipação', () => {
  it('aceita celular com DDD e com código do país', () => {
    expect(normalizeBrazilPhone('(11) 98888-7766')).toBe('5511988887766')
    expect(normalizeBrazilPhone('55 11 98888-7766')).toBe('5511988887766')
    expect(normalizeBrazilPhone('123')).toBeNull()
    expect(normalizeWhatsappPhone('+351 912 345 678')).toBe('351912345678')
    expect(normalizeWhatsappPhone('00351912345678')).toBe('351912345678')
    expect(normalizeWhatsappPhone('+1')).toBeNull()
  })

  it('mascara o celular enquanto digita e mostra número de outro país', () => {
    expect(formatWhatsappInput('1194546')).toBe('(11) 9454-6')
    expect(formatWhatsappInput('11945467890')).toBe('(11) 94546-7890')
    expect(formatWhatsappInput('+351912345678')).toBe('+351 912 345 678')
    expect(formatWhatsappPhone('5511988887766')).toBe('(11) 98888-7766')
    expect(formatWhatsappPhone('351912345678')).toBe('+351 912 345 678')
    expect(formatWhatsappPhone('12025550134')).toBe('+1 202 555 0134')
  })

  it('calcula o valor das parcelas confirmadas', () => {
    expect(anticipationAmount(4, 850.5)).toBe(3402)
  })

  it('monta a mensagem com o contrato e o valor', () => {
    const text = anticipationMessage({
      participant: 'Maria Souza',
      associateCode: '120114',
      installments: 3,
      installmentValue: 1000,
    })
    expect(text).toContain('Departamento de Cobrança')
    expect(text).toContain('Contrato 120114')
    expect(text).toContain('3 parcelas')
    expect(text).toContain('R$')
    expect(text).toContain('3.000,00')
  })
})
