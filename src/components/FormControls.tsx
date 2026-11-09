import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, X } from 'lucide-react'

export function SearchableDropdown({ name, label, value, options, onChange, required = false, placeholder }: {
  name?: string
  label?: string
  value: string
  options: string[]
  onChange: (value: string) => void
  required?: boolean
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const filtered = useMemo(() => options.filter(option => option.toLowerCase().includes(query.toLowerCase())), [options, query])
  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  return <div ref={rootRef} className="searchable-control">
    {label && <label>{label}</label>}
    {name && <input type="hidden" name={name} value={value} required={required} />}
    <button type="button" className="searchable-trigger" onClick={() => setOpen(previous => !previous)} aria-expanded={open}>
      <span className={value ? '' : 'placeholder-text'}>{value || placeholder || `Select ${label?.toLowerCase() || 'an option'}`}</span><ChevronDown size={16} />
    </button>
    {open && <div className="searchable-menu">
      <input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Search..." aria-label={`Search ${label || 'options'}`} />
      <div className="searchable-options">{filtered.length ? filtered.map(option => <button type="button" key={option} onClick={() => { onChange(option); setOpen(false); setQuery('') }}><span>{option}</span>{value === option && <Check size={15} />}</button>) : <small>No matches found</small>}</div>
    </div>}
  </div>
}

export function MultiSelectComboBox({ label, options, values, onChange }: {
  label: string
  options: string[]
  values: string[]
  onChange: (values: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const filtered = options.filter(option => option.toLowerCase().includes(query.toLowerCase()))
  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  const toggle = (option: string) => onChange(values.includes(option) ? values.filter(value => value !== option) : [...values, option])
  return <div ref={rootRef} className="multi-select-control">
    <button type="button" className="multi-select-trigger" onClick={() => setOpen(previous => !previous)} aria-expanded={open}><span>{values.length ? `${values.length} ${label.toLowerCase()} selected` : label}</span><ChevronDown size={16} /></button>
    {values.length > 0 && <div className="selected-options">{values.map(value => <button type="button" key={value} onClick={() => toggle(value)}>{value}<X size={12} /></button>)}</div>}
    {open && <div className="searchable-menu multi-select-menu"><input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder={`Search ${label.toLowerCase()}...`} /><div className="searchable-options">{filtered.map(option => <button type="button" key={option} onClick={() => toggle(option)}><span>{option}</span>{values.includes(option) && <Check size={15} />}</button>)}</div></div>}
  </div>
}
