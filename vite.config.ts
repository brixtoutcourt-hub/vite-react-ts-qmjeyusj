import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: {
        enabled: true // <--- C'est ça qui permet de tester l'installation tout de suite
      },
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: 'Jeu Base 10',
        short_name: 'Base10',
        description: 'Jeu de numération Montessori',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'landscape',
        icons: [
          {
            src: 'https://cdn-icons-png.flaticon.com/512/1048/1048950.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
})