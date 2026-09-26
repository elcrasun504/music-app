# Cholumusica

Aplicación Express para compartir música y vídeos, gestionar playlists y personalizar la apariencia desde el panel de administración. Incluye una PWA instalable con una pantalla local para reproducir audio elegido desde el dispositivo cuando no hay conexión.

## Requisitos

- Node.js 18 o posterior
- npm
- Una base SQLite y un directorio de subidas con almacenamiento persistente al desplegar

## Desarrollo local

1. Instala las dependencias: `npm ci`
2. Copia `.env.example` a `.env` y configura `DATABASE_URL` y `SESSION_SECRET`.
3. Genera Prisma y prepara el esquema: `npm run db:generate` y `npm run db:push`.
4. Inicia la aplicación: `npm run dev`.

La aplicación queda disponible en `http://localhost:3000`.

## Despliegue

Configura estas variables en el hosting:

- `NODE_ENV=production`
- `PORT`: usa el valor que asigne el hosting.
- `SESSION_SECRET`: secreto aleatorio de al menos 32 caracteres; no uses el valor de ejemplo ni lo subas al repositorio.
- `DATABASE_URL`: ruta SQLite escribible en un volumen persistente, por ejemplo `file:/data/cholumusica.db`.

Comando de arranque: `npm start`. Antes del primer arranque ejecuta `npm ci`, `npm run db:generate` y `npm run db:push`.

El directorio `uploads/` guarda audio, vídeo y recursos del sitio; `public/uploads/` guarda avatares. Ambos deben montarse en almacenamiento persistente y conservarse junto con el archivo SQLite. Si el hosting usa disco efímero, se perderán datos y archivos al reiniciar o volver a desplegar.

La instalación PWA en teléfonos requiere HTTPS en el dominio público. iPhone instala desde Safari mediante “Añadir a pantalla de inicio”; Android ofrece la instalación desde un navegador compatible. Las acciones del servidor (cuentas, administración, subidas y cambios de playlists) requieren conexión. La pantalla offline reproduce archivos de audio que la persona elige desde el dispositivo.

La sesión usa almacenamiento en memoria: los usuarios tendrán que iniciar sesión de nuevo después de reiniciar el proceso, y una instalación con varias réplicas necesita un almacén de sesiones compartido.

## Personalización

El panel de administrador permite cambiar colores, tipografías, textos, emojis, imágenes, estilo visual, densidad, patrón de fondo, navegación, movimiento, precarga multimedia y el título de las estadísticas del perfil.

Las subidas de logo, portada, avatares y multimedia se validan por tipo de archivo antes de guardarse.
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
- Subida de archivos de audio y vídeo MP4 con validación real del MIME.
- Biblioteca pública con reproductores de audio.
- Gestión de playlists mixtas con MP3 y MP4 por usuario autenticado.
- Reproducción secuencial desde una playlist.
- Eliminación segura de canciones y playlists.
- Búsqueda por título o artista.

## Estructura principal

- `server.js` — arranque del servidor y rutas principales.
- `database.js` — conexión y acceso a SQLite/Prisma.
- `routes/` — autenticación, canciones y playlists.
- `uploads/` — archivos de audio subidos.
- `views/` — plantillas EJS.
