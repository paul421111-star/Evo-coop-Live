export function ContractDigits({ code }: { code: string }) {
  if (!/^\d{6}$/.test(code)) return code
  return (
    <span className="contract-code">
      <span className="is-group">{code.slice(0, 2)}</span>
      <span className="is-ball">{code.slice(2)}</span>
    </span>
  )
}
