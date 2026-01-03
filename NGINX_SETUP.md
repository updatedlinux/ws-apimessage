# Configuración de Nginx Proxy Manager

Esta guía explica cómo configurar Nginx Proxy Manager para el WhatsApp Messaging API.

## 📋 Configuración Requerida

### URL del Servicio
- **Dominio**: `https://wsapi.arsystech.net`
- **SSL**: Activado (SSL Offloading)

### Configuración de Proxy Hosts

Necesitas crear **dos Proxy Hosts** en Nginx Proxy Manager:

#### 1. Proxy Host para Dashboard (Puerto 80)

- **Domain Names**: `wsapi.arsystech.net`
- **Scheme**: `http`
- **Forward Hostname/IP**: `localhost` (o la IP del servidor)
- **Forward Port**: `80`
- **Block Common Exploits**: ✅ Activado
- **Websockets Support**: ✅ Activado
- **SSL**: ✅ Activado (Let's Encrypt recomendado)

**Advanced Tab - Custom Nginx Configuration:**
```nginx
# Servir index.html por defecto
location = / {
    try_files /index.html =404;
}

# Servir archivos estáticos
location / {
    root /path/to/assets;
    try_files $uri $uri/ /index.html;
    index index.html;
}
```

#### 2. Proxy Host para API (Puerto 3000)

- **Domain Names**: `wsapi.arsystech.net`
- **Scheme**: `http`
- **Forward Hostname/IP**: `localhost` (o la IP del servidor)
- **Forward Port**: `3000`
- **Block Common Exploits**: ✅ Activado
- **Websockets Support**: ✅ Activado
- **SSL**: ✅ Activado (mismo certificado que el dashboard)

**Advanced Tab - Custom Nginx Configuration:**
```nginx
# Enrutar solo rutas /api/* al puerto 3000
location /api/ {
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
    
    # Timeouts
    proxy_read_timeout 300s;
    proxy_connect_timeout 75s;
    proxy_send_timeout 300s;
}

# Health check
location /api/health {
    proxy_pass http://localhost:3000;
    access_log off;
}
```

## 🔧 Configuración Alternativa (Un Solo Proxy Host)

Si prefieres usar un solo Proxy Host, puedes configurarlo así:

- **Domain Names**: `wsapi.arsystech.net`
- **Scheme**: `http`
- **Forward Hostname/IP**: `localhost`
- **Forward Port**: `80`
- **Block Common Exploits**: ✅ Activado
- **Websockets Support**: ✅ Activado
- **SSL**: ✅ Activado

**Advanced Tab - Custom Nginx Configuration:**
```nginx
# Enrutar API al puerto 3000
location /api/ {
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
    
    # Timeouts
    proxy_read_timeout 300s;
    proxy_connect_timeout 75s;
    proxy_send_timeout 300s;
}

# Dashboard en puerto 80
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
```
```

## ✅ Verificación

Después de configurar, verifica que:

1. **Dashboard**: `https://wsapi.arsystech.net/` muestra el dashboard
2. **API Health**: `https://wsapi.arsystech.net/api/health` responde correctamente
3. **API Endpoint**: `https://wsapi.arsystech.net/api/send-message` está accesible
4. **CORS**: Las peticiones desde cualquier origen son aceptadas

## 🔒 Seguridad

- ✅ SSL/TLS activado (Let's Encrypt recomendado)
- ✅ CORS configurado (completamente libre según requerimientos)
- ✅ Rate limiting configurado en Nginx
- ✅ Headers de seguridad configurados

## 📝 Notas

- El puerto 80 requiere permisos de root o usar `authbind`/`setcap`
- Para producción, considera usar un usuario no-root para Node.js
- El SSL Offloading se maneja completamente en Nginx Proxy Manager

