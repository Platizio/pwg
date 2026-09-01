"use client"

import { createContext, useContext, useState, type ReactNode } from 'react'

interface AppContextValue {
  isContactOpen: boolean
  contactInterest: string
  openContact: (interest?: string) => void
  closeContact: () => void
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [isContactOpen, setIsContactOpen] = useState(false)
  const [contactInterest, setContactInterest] = useState('')

  const openContact = (interest = '') => {
    setContactInterest(interest)
    setIsContactOpen(true)
    document.body.style.overflow = 'hidden'
  }

  const closeContact = () => {
    setIsContactOpen(false)
    document.body.style.overflow = ''
  }

  return (
    <AppContext.Provider value={{ isContactOpen, contactInterest, openContact, closeContact }}>
      {children}
    </AppContext.Provider>
  )
}

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useAppContext must be used within AppProvider')
  return ctx
}
