import 'flag-icons/css/flag-icons.min.css'
import { getCountry } from '../data/countries'

export function Flag({ code, size }: { code: string | null; size?: number }) {
  if (code === null) {
    return (
      <span className="flag flag-placeholder" style={{ fontSize: size ?? 20 }} aria-hidden="true">
        🏳
      </span>
    )
  }
  return (
    <span
      className={`fi fi-${code} flag`}
      style={{ fontSize: size ?? 20 }}
      role="img"
      aria-label={getCountry(code)?.name ?? code}
    />
  )
}
