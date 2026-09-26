# Cholumusica

Aplicación web para compartir música con autenticación, subida de archivos y playlists.

## Requisitos

- Node.js 18+
- npm

## Instalación

1. Abre una terminal en la carpeta del proyecto.
2. Instala dependencias:
   ```bash
   npm install
   ```
3. Inicia el servidor en modo desarrollo:
   ```bash
   npm run dev
   ```

La app quedará disponible en `http://localhost:3000`.

## Variables de entorno

El proyecto ya incluye un archivo `.env` con la configuración mínima:

```env
SESSION_SECRET=musica-calida-2026-secret
PORT=3000
```

## Funcionalidades principales

- Registro e inicio de sesión con sesiones.
- Subida de archivos de audio válidos con validación real del MIME.
- Biblioteca pública con reproductores de audio.
- Gestión de playlists por usuario autenticado.
- Reproducción secuencial desde una playlist.
- Eliminación segura de canciones y playlists.
- Búsqueda por título o artista.

## Estructura principal

- `server.js` — arranque del servidor y rutas principales.
- `database.js` — conexión y acceso a SQLite/Prisma.
- `routes/` — autenticación, canciones y playlists.
- `uploads/` — archivos de audio subidos.
- `views/` — plantillas EJS.
