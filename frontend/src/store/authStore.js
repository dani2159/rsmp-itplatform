import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import api from '../services/api'

export const useAuthStore = create(persist((set) => ({
  user: null,
  checked: false,
  setUser: (user) => set({ user }),
  checkSession: async () => {
    try {
      const r = await api.get('/auth/me')
      set({ user: r.data, checked: true })
    } catch {
      set({ user: null, checked: true })
    }
  },
  logout: async () => {
    await api.post('/auth/logout').catch(() => {})
    set({ user: null })
    window.location.href = '/login'
  },
}), { name: 'rsmp-it-auth', partialize: (state) => ({ user: state.user }), merge: (persistedState, currentState) => ({ ...currentState, user: persistedState?.user ?? null }) }))
