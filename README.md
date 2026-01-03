# WhatsApp Messaging API

API independiente para envío de mensajes vía WhatsApp y Telegram con dashboard de gestión integrado.

## 🚀 Características

- ✅ **Conexión vía QR**: Escanea el código QR con WhatsApp para conectar
- ✅ **Multi-Canal**: Soporte para WhatsApp y Telegram
- ✅ **Envío de Mensajes**: API REST para enviar mensajes a números telefónicos individuales
- ✅ **Persistencia de Sesión**: Mantiene la conexión activa automáticamente
- ✅ **Dashboard Web**: Interfaz web para gestión y monitoreo
- ✅ **Autenticación JWT**: Sistema de autenticación seguro
- ✅ **Historial de Mensajes**: Registro completo de todos los mensajes enviados con canal
- ✅ **Estadísticas**: Métricas y estadísticas de mensajes por canal
- ✅ **Arquitectura Separada**: Frontend y Backend en dominios separados para mejor escalabilidad

## 🌐 Arquitectura de Despliegue

El proyecto está diseñado para funcionar con dos dominios separados:

- **Frontend (Dashboard)**: `https://wsapi.arsystech.net` → Puerto 80
  - Sirve el dashboard web y archivos estáticos
  - Configurado en Nginx Proxy Manager para hacer proxy al puerto 80

- **Backend (API)**: `https://wsapiback.arsystech.net` → Puerto 3000
  - Sirve todos los endpoints de la API (`/api/*`)
  - Configurado en Nginx Proxy Manager para hacer proxy al puerto 3000
  - CORS completamente abierto para permitir peticiones desde el frontend

El frontend detecta automáticamente el entorno y hace las llamadas al backend correcto:
- **Producción**: `https://wsapiback.arsystech.net/api/*`
- **Desarrollo**: `http://localhost:3000/api/*`

## 📋 Requisitos

- Node.js 16+
- MariaDB/MySQL 5.7+
- Chromium (para whatsapp-web.js)
- Token de Bot de Telegram (opcional, para usar Telegram)

## 🛠️ Instalación

### 1. Clonar e instalar dependencias

```bash
# Clonar el repositorio
git clone <repository-url>
cd ws-apimessage

# Instalar dependencias
npm install
```

### 2. Configurar base de datos

```bash
# Copiar archivo de ejemplo
cp env.example .env

# Editar .env con tus configuraciones
nano .env
```

Configura las siguientes variables en `.env`:

```env
# Puertos de los servidores
API_PORT=3000
DASHBOARD_PORT=80

# Configuración de base de datos MariaDB
DB_HOST=localhost
DB_USER=whatsapp_user
DB_PASSWORD=your_password
DB_NAME=whatsapp_messaging
DB_PORT=3306

# Configuración de seguridad
API_SECRET_KEY=your_secret_key_here
JWT_SECRET=your_jwt_secret_here
```

### 3. Inicializar base de datos

```bash
# Ejecutar script de inicialización
npm run init-db
```

Este script:
- Crea la base de datos si no existe
- Crea todas las tablas necesarias
- Crea un usuario administrador por defecto

### 4. Iniciar el servidor

```bash
# Modo producción
npm start

# Modo desarrollo (con nodemon)
npm run dev
```

Los servidores estarán disponibles en:
- API: `http://localhost:3000`
- Dashboard: `http://localhost:80`
- Swagger Docs: `http://localhost:3000/api/docs`

## 📱 Uso

### Dashboard Web

1. Accede a `http://localhost:80` (o `https://wsapi.arsystech.net` en producción)
2. Inicia sesión con el usuario admin creado durante la inicialización
3. Escanea el código QR que aparece en el dashboard
4. Una vez conectado, podrás ver el estado de conexión y el historial de mensajes

**Nota**: En producción, el dashboard (`wsapi.arsystech.net`) hace llamadas automáticamente al backend (`wsapiback.arsystech.net/api/*`). En desarrollo local, usa `http://localhost:3000/api`.

### API REST

#### Enviar Mensaje

```bash
# En producción
curl -X POST https://wsapiback.arsystech.net/api/send-message \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your_secret_key_here" \
  -d '{
    "countryCode": "+58",
    "phoneNumber": "4121234567",
    "message": "Hola, este es un mensaje de prueba"
  }'

# En desarrollo local
curl -X POST http://localhost:3000/api/send-message \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your_secret_key_here" \
  -d '{
    "countryCode": "+58",
    "phoneNumber": "4121234567",
    "message": "Hola, este es un mensaje de prueba"
  }'
```

**Formato del Request:**

```json
{
  "countryCode": "+58",
  "phoneNumber": "4121234567",
  "channel": "WHATSAPP",  // o "TELEGRAM"
  "message": "Tu mensaje aquí"
}
```

**Nota:** El campo `channel` es opcional y por defecto usa `WHATSAPP`. Puede ser `WHATSAPP` o `TELEGRAM`. Para usar Telegram, debes configurar `TELEGRAM_BOT_TOKEN` en el `.env` y el usuario debe haber iniciado conversación con el bot primero.

**Respuesta exitosa:**

```json
{
  "success": true,
  "messageId": "3EB0C767F26CXXXXX",
  "phoneNumber": "584121234567",
  "error": null
}
```

## 📚 Documentación de la API (Swagger)

La documentación interactiva de la API está disponible en Swagger:

- **Producción**: `https://wsapiback.arsystech.net/api/docs`
- **Desarrollo**: `http://localhost:3000/api/docs`

### Uso de Swagger

1. Accede a `/api/docs` en el navegador
2. Usa el endpoint `/api/auth/login` para obtener un token JWT
3. Haz clic en el botón **"Authorize"** (🔒) en la parte superior
4. Ingresa el token obtenido en el formato: `Bearer <tu_token>`
5. Ahora puedes probar todos los endpoints protegidos directamente desde Swagger

**Nota**: El endpoint de login está disponible sin autenticación y devuelve un token JWT que puedes usar para acceder a los demás endpoints.

## 🔌 API Endpoints

### Autenticación

#### POST /api/auth/login
Inicia sesión y obtiene token JWT.

**Body:**
```json
{
  "username": "admin",
  "password": "tu_password"
}
```

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "token": "jwt_token_here",
    "user": {
      "id": 1,
      "username": "admin",
      "email": "admin@example.com",
      "fullName": "Administrador"
    }
  }
}
```

#### GET /api/auth/verify
Verifica si el token JWT es válido.

**Headers:**
```
Authorization: Bearer <token>
```

#### POST /api/auth/change-password
Cambia la contraseña del usuario autenticado.

**Headers:**
```
Authorization: Bearer <token>
```

**Body:**
```json
{
  "currentPassword": "password_actual",
  "newPassword": "nueva_password"
}
```

### Canales de Mensajería

El API soporta dos canales de mensajería:
- **WHATSAPP**: Requiere conexión vía QR (ver sección WhatsApp)
- **TELEGRAM**: Requiere un bot token configurado en `.env`

#### Configuración de Telegram

1. Crea un bot en Telegram hablando con [@BotFather](https://t.me/botfather)
2. Obtén el token del bot
3. Agrega el token en tu `.env`:
   ```env
   TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
   ```
4. **Importante**: Los usuarios deben iniciar conversación con tu bot primero antes de que puedas enviarles mensajes. El bot no puede iniciar conversaciones.

**Nota sobre Chat IDs en Telegram:**
- Para enviar mensajes, necesitas el `chat_id` del usuario
- El `phoneNumber` en el endpoint puede ser un `chat_id` numérico
- Si el usuario ya inició conversación, puedes usar su número telefónico (pero el chat_id es más confiable)

### WhatsApp

#### GET /api/status
Obtiene el estado de la conexión de WhatsApp.

**Headers:**
```
Authorization: Bearer <token>
```

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "connected": true,
    "qrGenerated": false,
    "clientInfo": {
      "name": "Tu Nombre",
      "phone": "584121234567@c.us",
      "platform": "android",
      "isConnected": true
    }
  }
}
```

#### GET /api/qr
Obtiene el código QR para conectar WhatsApp.

**Headers:**
```
Authorization: Bearer <token>
```

**Respuesta:**
```json
{
  "success": true,
  "connected": false,
  "qr": "base64_image_data",
  "expiresAt": "2025-01-13T23:32:16.417Z"
}
```

#### POST /api/send-message
Envía un mensaje a un número telefónico.

**Headers (opcional):**
```
X-API-Key: your_secret_key_here
```

**Body:**
```json
{
  "countryCode": "+58",
  "phoneNumber": "4121234567",
  "message": "Mensaje a enviar"
}
```

#### GET /api/messages
Obtiene el historial de mensajes enviados.

**Headers:**
```
Authorization: Bearer <token>
```

**Query Parameters:**
- `limit` (opcional): Número de mensajes a retornar (default: 50)
- `offset` (opcional): Offset para paginación (default: 0)

#### GET /api/stats
Obtiene estadísticas de mensajes.

**Headers:**
```
Authorization: Bearer <token>
```

**Respuesta:**
```json
{
  "success": true,
  "data": [
    {
      "status": "sent",
      "count": "150"
    },
    {
      "status": "failed",
      "count": "5"
    }
  ]
}
```

#### POST /api/disconnect
Desconecta WhatsApp manualmente.

**Headers:**
```
Authorization: Bearer <token>
```

#### POST /api/reconnect
Fuerza la reconexión de WhatsApp.

**Headers:**
```
Authorization: Bearer <token>
```

### Health Check

#### GET /api/health
Verifica el estado del servicio.

**Respuesta:**
```json
{
  "status": "ok",
  "timestamp": "2025-01-13T23:32:16.417Z",
  "uptime": 3600,
  "database": {
    "healthy": true
  },
  "whatsapp": {
    "connected": true,
    "qrGenerated": false
  }
}
```

## 🗄️ Base de Datos

El script de inicialización crea las siguientes tablas:

- **ws_config**: Configuración del servicio
- **ws_messages**: Historial de mensajes enviados
- **ws_connections**: Logs de conexión
- **ws_users**: Usuarios del dashboard
- **ws_sessions**: Sesiones de WhatsApp y Telegram
- **ws_messages**: Mensajes enviados (incluye campo `channel` para identificar el canal usado)

## 🔧 Solución de Problemas

### Error de Conexión a Base de Datos

- Verifica que MariaDB/MySQL esté corriendo
- Confirma las credenciales en el archivo `.env`
- Asegúrate de que la base de datos existe

### QR No Aparece

- Limpia las sesiones: `rm -rf sessions/*`
- Reinicia el servicio
- Verifica que no haya procesos de Chrome bloqueados

### Error de Permisos en Puerto 80

El puerto 80 requiere permisos de root. Opciones:
- Ejecutar con `sudo` (no recomendado para producción)
- Usar `authbind`: `sudo apt install authbind && sudo touch /etc/authbind/byport/80 && sudo chmod 500 /etc/authbind/byport/80 && sudo chown $USER /etc/authbind/byport/80`
- Usar `setcap`: `sudo setcap 'cap_net_bind_service=+ep' $(which node)`
- Usar un proxy reverso (recomendado)

### Error al Enviar Mensajes

- Verifica que WhatsApp esté conectado (revisa el dashboard)
- Confirma que el número tenga el formato correcto (código de país + número)
- Revisa los logs del servidor para más detalles

### Problemas de Autenticación

- Verifica que el token JWT no haya expirado
- Asegúrate de incluir el header `Authorization: Bearer <token>`
- Revisa que el `JWT_SECRET` en `.env` sea el correcto

## 📝 Logs

Los logs se guardan en:
- Consola del terminal
- Archivo: `./logs/whatsapp-service.log` (si está configurado)

## 🔒 Seguridad

- Autenticación JWT requerida para endpoints del dashboard
- API Key opcional para endpoint de envío de mensajes
- Contraseñas hasheadas con bcrypt
- Validación de entrada en todos los endpoints
- Rate limiting configurable

## 📞 Soporte

Para problemas o preguntas, revisa los logs del servidor o crea un issue en el repositorio.

---

**Versión:** 2.0.0  
**Licencia:** MIT
