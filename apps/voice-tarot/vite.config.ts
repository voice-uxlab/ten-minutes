import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';
export default defineConfig({plugins:[react(),tailwindcss()],resolve:{alias:{'@':fileURLToPath(new URL('./src',import.meta.url))}},server:{port:5173,strictPort:true,proxy:Object.fromEntries(['/live-session','/live-report','/reading','/session$','/auth','/voice-settings','/voice-lab','/speech','/research'].map(path=>[path==='/session$'?'^/session$':path,{target:'http://127.0.0.1:3011',ws:path==='/speech'}]))}});
