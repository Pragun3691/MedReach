export const inputClassName = 'min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3.5 text-[15px] text-slate-950 outline-none placeholder:text-slate-400 hover:border-slate-400 focus:border-blue-600 focus:ring-3 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-50'

export function FormField({ id, label, error, hint, children }) {
  return (
    <div>
      <label className="mb-2 block text-sm font-semibold text-slate-800" htmlFor={id}>{label}</label>
      {children}
      <div aria-live="polite" aria-atomic="true">
        {hint && !error && <p className="mt-1.5 text-xs leading-5 text-slate-500" id={`${id}-hint`}>{hint}</p>}
        {error && <p className="form-field-error" id={`${id}-error`}><span aria-hidden="true">!</span>{error}</p>}
      </div>
    </div>
  )
}

export function PasswordField({
  id,
  label,
  value,
  onChange,
  onBlur,
  visible,
  onToggle,
  error,
  autoComplete,
  hint,
  disabled,
  toggleLabels = { show: 'Show', hide: 'Hide' },
}) {
  return (
    <FormField error={error} hint={hint} id={id} label={label}>
      <div className="relative">
        <input
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          aria-invalid={Boolean(error)}
          autoComplete={autoComplete}
          className={`${inputClassName} pr-18`}
          disabled={disabled}
          id={id}
          maxLength={128}
          minLength={id.includes('confirm') ? undefined : 12}
          onChange={onChange}
          onBlur={onBlur}
          required
          type={visible ? 'text' : 'password'}
          value={value}
        />
        <button
          className="absolute inset-y-1 right-1 rounded-md px-3 text-xs font-semibold text-blue-700 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-600"
          disabled={disabled}
          onClick={onToggle}
          type="button"
          aria-label={`${visible ? toggleLabels.hide : toggleLabels.show} ${label.toLowerCase()}`}
        >
          {visible ? toggleLabels.hide : toggleLabels.show}
        </button>
      </div>
    </FormField>
  )
}
