import { useCallback, useEffect, useMemo, useState } from 'react'
import { translateMessage } from '../i18n/messages.js'
import { LanguageContext } from './language-context.js'

const storageKey = 'medreach.language'
const supportedLanguages = new Set(['en', 'hi'])

function storedLanguage() {
  try {
    const value = window.localStorage.getItem(storageKey)
    return supportedLanguages.has(value) ? value : 'en'
  } catch {
    return 'en'
  }
}

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(storedLanguage)
  const locale = language === 'hi' ? 'hi-IN' : 'en-IN'
  const setLanguage = useCallback(value => {
    if (supportedLanguages.has(value)) setLanguageState(value)
  }, [])

  useEffect(() => {
    document.documentElement.lang = locale
    document.documentElement.dir = 'ltr'
    try {
      window.localStorage.setItem(storageKey, language)
    } catch {
      // In-memory selection still works when browser storage is unavailable.
    }
  }, [language, locale])

  const t = useCallback((key, values) => translateMessage(language, key, values), [language])
  const value = useMemo(() => ({ language, locale, setLanguage, t }), [language, locale, setLanguage, t])
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}
