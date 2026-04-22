import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
    plugins: [react()],
    root: '.',
    server: {
        port: 5191,
        host: true,
        allowedHosts: true
    }
})
