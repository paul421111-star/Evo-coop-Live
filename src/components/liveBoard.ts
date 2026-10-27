/** A plaquinha da live só aceita o contrato de 6 dígitos. Nome nunca entra. */
export function liveContractCode(value: string) {
  return /^\d{6}$/.test(value.trim()) ? value.trim() : ''
}
