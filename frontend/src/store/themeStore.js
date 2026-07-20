import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Design system SIMRS ZAIDAN light-only -- dark mode dinonaktifkan.
export const useThemeStore = create(persist((set) => ({
  theme: 'light',
  toggle: () => {
    set({ theme: 'light' })
    document.documentElement.setAttribute('data-theme', 'light')
  },
  apply: () => {
    document.documentElement.setAttribute('data-theme', 'light')
  },
}), { name: 'rsmp-theme' }))
