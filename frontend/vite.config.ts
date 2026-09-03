import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Backend en Supabase (supabase-js habla directo con el proyecto de
// Supabase, con su propia URL) -- a diferencia del proyecto original, aca no
// hace falta proxear /api a un backend propio corriendo en local.
// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  build: {
    outDir: 'dist',
  },
})
