import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({base:process.env.VITE_BASE_PATH||'/',plugins:[react(),tailwindcss()],build:{outDir:process.env.VITE_PAGES_BUILD==='true'?'dist/pages':'dist/client',rollupOptions:{output:{manualChunks:{charts:['recharts'],map:['leaflet']}}}},server:{host:'127.0.0.1',port:5173,strictPort:true,proxy:{'/api':'http://127.0.0.1:8787'}}});
