import { createContext } from 'react'
import { translateMessage } from '../i18n/messages.js'

export const defaultLanguageValue = {
  language: 'en',
  locale: 'en-IN',
  setLanguage: () => {},
  t: (key, values) => translateMessage('en', key, values),
}

export const LanguageContext = createContext(defaultLanguageValue)
