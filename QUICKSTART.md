# 🚀 Guía de Inicio Rápido - WhatsApp Messaging API

## ✅ Instalación Rápida

### 1. Instalar Dependencias

```bash
npm install
```

### 2. Configurar Variables de Entorno

```bash
cp env.example .env
# Editar .env con tus configuraciones
nano .env
```

### 3. Inicializar Base de Datos

```bash
npm run init-db
```

Este comando:
- Crea la base de datos si no existe
- Crea todas las tablas necesarias
- Crea un usuario administrador (se te pedirá la contraseña)

### 4. Iniciar el Servidor

```bash
npm start
```

El servidor estará disponible en `http://localhost:3003`

## 📱 Uso del Dashboard

1. Accede a `http://localhost:3003`
2. Inicia sesión con el usuario admin creado
3. Escanea el código QR que aparece en el dashboard
4. Una vez conectado, podrás ver el estado y el historial de mensajes

## 🔌 Enviar Mensajes vía API

```bash
curl -X POST http://localhost:3003/api/send-message \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your_secret_key_here" \
  -d '{
    "countryCode": "+58",
    "phoneNumber": "4121234567",
    "message": "Hola, este es un mensaje de prueba"
  }'
```

## 🎯 Características Principales

- ✅ **Conexión vía QR**: Escanea el código QR con WhatsApp
- ✅ **Dashboard Web**: Interfaz web para gestión y monitoreo
- ✅ **API REST**: Endpoint para enviar mensajes
- ✅ **Autenticación JWT**: Sistema de autenticación seguro
- ✅ **Historial Completo**: Registro de todos los mensajes enviados
- ✅ **Estadísticas**: Métricas y estadísticas en tiempo real

## 🔧 Solución de Problemas

### QR No Aparece
- Limpia las sesiones: `rm -rf sessions/*`
- Reinicia el servicio
- Verifica que el puerto 3003 esté disponible

### Error de Base de Datos
- Verifica que MariaDB/MySQL esté corriendo
- Confirma las credenciales en `.env`
- Ejecuta `npm run init-db` nuevamente

### Error al Enviar Mensajes
- Verifica que WhatsApp esté conectado (revisa el dashboard)
- Confirma que el número tenga el formato correcto
- Revisa los logs del servidor

---

**¡Listo para usar!** 🎉
