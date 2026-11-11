import { useEffect, useId, useState } from 'react'
import { formatTime, parseTime } from '../../domain/timer'

export function TimeInput({
  seconds,
  onChange,
  label,
  presets,
}: {
  seconds: number
  onChange: (seconds: number) => void
  label: string
  presets?: number[]
}) {
  const id = useId()
  const [text, setText] = useState(formatTime(seconds * 1000))
  useEffect(() => setText(formatTime(seconds * 1000)), [seconds])

  const invalid = parseTime(text) === null

  const commit = () => {
    const parsed = parseTime(text)
    if (parsed !== null && parsed !== seconds) onChange(parsed)
    else setText(formatTime(seconds * 1000))
  }

  return (
    <div className="time-input">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        value={text}
        aria-invalid={invalid ? true : undefined}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit()
          }
        }}
      />
      {presets && presets.length > 0 && (
        <div className="time-input-presets">
          {presets.map((p) => (
            <button key={p} type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(p)}>
              {formatTime(p * 1000)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
