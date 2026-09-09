import { useContext } from 'react'
import { LanguageContext } from '../context/language-context.js'

export function useLanguage() {
  return useContext(LanguageContext)
}
