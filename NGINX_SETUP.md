# Configuración de Nginx Proxy Manager

Esta guía explica cómo configurar Nginx Proxy Manager para el WhatsApp Messaging API con dos dominios separados.

## 📋 Configuración Requerida

### URLs del Servicio
- **Frontend (Dashboard)**: `https://wsapi.arsystech.net` → Puerto 80
- **Backend (API)**: `https://wsapiback.arsystech.net` → Puerto 3000
- **SSL**: Activado en ambos (SSL Offloading)

## 🔧 Configuración de Proxy Hosts

Necesitas crear **dos Proxy Hosts separados** en Nginx Proxy Manager:

### 1. Proxy Host para Dashboard (Frontend)

**Configuración Básica:**
- **Domain Names**: `wsapi.arsystech.net`
- **Scheme**: `http`
- **Forward Hostname/IP**: `localhost` (o la IP del servidor donde está desplegado)
- **Forward Port**: `80`
- **Block Common Exploits**: ✅ Activado
- **Websockets Support**: ✅ Activado
- **SSL**: ✅ Activado (Let's Encrypt recomendado)

**Advanced Tab - Custom Nginx Configuration:**
```nginx
# Servir archivos estáticos del dashboard
location / {
    proxy_pass http://localhost:80;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    
    # Servir index.html por defecto
    try_files $uri $uri/ /index.html;
}

# Headers de seguridad
add_header X-Frame-Options SAMEORIGIN always;
add_header X-Content-Type-Options nosniff always;
add_header X-XSS-Protection "1; mode=block" always;
```

### 2. Proxy Host para API (Backend)

**Configuración Básica:**
- **Domain Names**: `wsapiback.arsystech.net`
- **Scheme**: `http`
- **Forward Hostname/IP**: `localhost` (o la IP del servidor donde está desplegado)
- **Forward Port**: `3000`
- **Block Common Exploits**: ✅ Activado
- **Websockets Support**: ✅ Activado
- **SSL**: ✅ Activado (Let's Encrypt recomendado)

**Advanced Tab - Custom Nginx Configuration:**
```nginx
# Enrutar todas las rutas al puerto 3000
location / {
    proxy_pass http://localhost:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
    
    # CORS completamente libre
    add_header Access-Control-Allow-Origin * always;
    add_header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS" always;
    add_header Access-Control-Allow-Headers "Content-Type, Authorization, X-API-Key" always;
    add_header Access-Control-Allow-Credentials true always;
    
    # Manejar preflight OPTIONS
    if ($request_method = 'OPTIONS') {
        add_header Access-Control-Allow-Origin * always;
        add_header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS" always;
        add_header Access-Control-Allow-Headers "Content-Type, Authorization, X-API-Key" always;
        add_header Access-Control-Max-Age 1728000;
        add_header Content-Type 'text/plain; charset=utf-8';
        add_header Content-Length 0;
        return 204;
    }
    
    # Timeouts
    proxy_read_timeout 300s;
    proxy_connect_timeout 75s;
    proxy_send_timeout 300s;
}

# Health check endpoint
location /api/health {
    access_log off;
}
```

## ✅ Verificación

Después de configurar, verifica que:

1. **Dashboard Frontend**: 
   - `https://wsapi.arsystech.net/` muestra el dashboard
   - Los archivos estáticos se cargan correctamente

2. **API Backend**: 
   - `https://wsapiback.arsystech.net/api/health` responde correctamente
   - `https://wsapiback.arsystech.net/api/send-message` está accesible
   - Los headers CORS están presentes

3. **Comunicación Frontend-Backend**:
   - El dashboard en `wsapi.arsystech.net` hace llamadas a `wsapiback.arsystech.net/api/*`
   - Las peticiones CORS funcionan correctamente

4. **SSL/TLS**:
   - Ambos dominios tienen certificados SSL válidos
   - Las redirecciones HTTP → HTTPS funcionan

## 🔒 Seguridad

- ✅ SSL/TLS activado en ambos dominios (Let's Encrypt recomendado)
- ✅ CORS configurado (completamente libre según requerimientos)
- ✅ Rate limiting puede configurarse en Nginx si es necesario
- ✅ Headers de seguridad configurados
- ✅ Block Common Exploits activado

## 📝 Notas Importantes

1. **Puerto 80**: Requiere permisos de root o usar `authbind`/`setcap`
   ```bash
   # Opción 1: Usar authbind
   sudo apt install authbind
   sudo touch /etc/authbind/byport/80
   sudo chmod 500 /etc/authbind/byport/80
   sudo chown $USER /etc/authbind/byport/80
   
   # Opción 2: Usar setcap
   sudo setcap 'cap_net_bind_service=+ep' $(which node)
   ```

2. **Puerto 3000**: No requiere permisos especiales, funciona con usuario normal

3. **SSL Offloading**: Se maneja completamente en Nginx Proxy Manager

4. **CORS**: El backend está configurado para aceptar peticiones desde cualquier origen (`*`)

5. **Frontend**: El dashboard detecta automáticamente si está en producción y usa `https://wsapiback.arsystech.net/api` o en desarrollo usa `http://localhost:3000/api`

## 🚀 Flujo de Peticiones

```
Usuario → https://wsapi.arsystech.net/
         ↓
    Nginx Proxy Manager
         ↓
    Puerto 80 (Dashboard Server)
         ↓
    Sirve index.html
         ↓
    JavaScript hace fetch a https://wsapiback.arsystech.net/api/*
         ↓
    Nginx Proxy Manager
         ↓
    Puerto 3000 (API Server)
         ↓
    Procesa petición y responde
```

## 🔧 Troubleshooting

### El dashboard no carga
- Verifica que el Proxy Host para `wsapi.arsystech.net` apunte al puerto 80
- Revisa los logs de Nginx Proxy Manager
- Confirma que el servidor Node.js está corriendo en el puerto 80

### Las llamadas a la API fallan
- Verifica que el Proxy Host para `wsapiback.arsystech.net` apunte al puerto 3000
- Revisa la consola del navegador para errores CORS
- Confirma que el servidor Node.js está corriendo en el puerto 3000
- Verifica que los certificados SSL sean válidos en ambos dominios

### Errores CORS
- Confirma que los headers CORS están configurados en el Proxy Host del backend
- Verifica que el frontend está haciendo peticiones a `https://wsapiback.arsystech.net/api/*`
- Revisa que el método OPTIONS está siendo manejado correctamente
