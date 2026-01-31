const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

/**
 * Servicio de WhatsApp usando whatsapp-web.js
 * Más estable que Baileys y con mejor mantenimiento
 */
class WhatsAppService {
    constructor(databaseService = null) {
        this.client = null;
        this._isConnected = false;
        this._isQRGenerated = false;
        this.qrCode = null;
        this.sessionPath = path.join(__dirname, '../../sessions');
        this.databaseService = databaseService; // Referencia al servicio de base de datos
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectInterval = 30000; // 30 segundos
        this.reconnectTimer = null;
        this.isReconnecting = false;
        this.healthCheckInterval = 60000; // 1 minuto
        this.healthCheckTimer = null;

        // Configurar cliente con autenticación local
        this.setupClient();
    }

    /**
     * Configura el cliente de WhatsApp con whatsapp-web.js
     */
    setupClient() {
        try {
            logger.info('Configurando cliente de WhatsApp...');

            // Generar directorio de sesión único con timestamp
            const timestamp = Date.now();
            const uniqueSessionPath = path.join(__dirname, '../../sessions', `session-${timestamp}`);

            // Crear directorio único si no existe
            if (!fs.existsSync(uniqueSessionPath)) {
                fs.mkdirSync(uniqueSessionPath, { recursive: true });
            }

            logger.info(`Directorio de sesiones: ${uniqueSessionPath}`);

            // Limpiar sesiones antiguas
            this.cleanupOldSessions();

            this.client = new Client({
                authStrategy: new LocalAuth({
                    clientId: 'whatsapp-messaging-api',
                    dataPath: uniqueSessionPath
                }),
                puppeteer: {
                    headless: true,
                    executablePath: '/usr/lib64/chromium-browser/chromium-browser',
                    args: [
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-dev-shm-usage',
                        '--disable-accelerated-2d-canvas',
                        '--no-first-run',
                        '--no-zygote',
                        '--disable-gpu',
                        '--disable-web-security',
                        '--disable-features=VizDisplayCompositor',
                        '--disable-background-timer-throttling',
                        '--disable-backgrounding-occluded-windows',
                        '--disable-renderer-backgrounding',
                        '--single-process',
                        '--disable-software-rasterizer'
                    ],
                    timeout: 60000
                },
                // webVersionCache: {
                //     type: 'remote',
                //     remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html'
                // }
            });

            this.setupEventHandlers();
            logger.info('Cliente de WhatsApp configurado correctamente');
        } catch (error) {
            logger.error('Error configurando cliente de WhatsApp:', error);
            logger.error('Detalles del error de configuración:', {
                message: error.message,
                stack: error.stack,
                name: error.name
            });
            throw error;
        }
    }

    /**
     * Asegura que el directorio de sesiones existe
     */
    async ensureSessionDirectory() {
        try {
            fs.mkdirSync(this.sessionPath, { recursive: true });
            logger.info(`Directorio de sesiones: ${this.sessionPath}`);
        } catch (error) {
            logger.error('Error creando directorio de sesiones:', error);
            throw error;
        }
    }

    /**
     * Configura los event handlers del cliente
     */
    setupEventHandlers() {
        // Loading Screen (Nuevo para debug)
        this.client.on('loading_screen', (percent, message) => {
            logger.info(`⏳ WhatsApp cargando: ${percent}% - ${message}`);
        });

        // QR Code generado
        this.client.on('qr', async (qr) => {
            try {
                logger.info('🎯 QR RECIBIDO - Generando imagen...');
                await this.generateQR(qr);
            } catch (error) {
                logger.error('Error generando QR:', error);
            }
        });

        // Cliente listo
        this.client.on('ready', async () => {
            logger.info('✅ Evento READY recibido');
            await this._handleReady();
        });

        // Cliente autenticado
        this.client.on('authenticated', () => {
            logger.info('🔐 WhatsApp autenticado correctamente - Esperando evento ready...');

            // Watchdog: Si no recibimos 'ready' en 15 segundos, verificar manualmente
            setTimeout(async () => {
                if (!this._isConnected) {
                    logger.warn('⚠️ Watchdog: Autenticado pero no READY. Verificando estado...');
                    try {
                        const state = await this.client.getState();
                        logger.info(`ℹ️ Estado actual del cliente: ${state}`);

                        if (state === 'CONNECTED') {
                            logger.warn('⚠️ Watchdog: Forzando estado READY ya que está conectado');
                            await this._handleReady();
                        }
                    } catch (error) {
                        logger.error('❌ Watchdog error:', error);
                    }
                }
            }, 10000); // 10 segundos espera
        });

        // Cliente desconectado
        this.client.on('disconnected', async (reason) => {
            logger.warn(`❌ WhatsApp desconectado: ${reason}`);
            this._isConnected = false;
            this.qrCode = null;

            // Actualizar estado de sesión en base de datos
            if (this.databaseService) {
                try {
                    await this.databaseService.saveSession({
                        sessionId: 'default',
                        status: 'inactive'
                    });
                    logger.info('Estado de sesión actualizado a inactivo');
                } catch (error) {
                    logger.error('Error actualizando estado de sesión:', error);
                }
            }

            // Iniciar proceso de reconexión automática
            this.startReconnectionProcess();
        });

        // Error de autenticación
        this.client.on('auth_failure', async (msg) => {
            logger.error('❌ Error de autenticación:', msg);
            this._isConnected = false;
            this.qrCode = null;

            // Actualizar estado de sesión en base de datos
            if (this.databaseService) {
                try {
                    await this.databaseService.saveSession({
                        sessionId: 'default',
                        status: 'inactive'
                    });
                    logger.info('Estado de sesión actualizado a inactivo por fallo de autenticación');
                } catch (error) {
                    logger.error('Error actualizando estado de sesión:', error);
                }
            }
        });

        // Error general
        this.client.on('error', (error) => {
            logger.error('❌ Error en cliente WhatsApp:', error);
        });

        // Cambio de estado
        this.client.on('change_state', (state) => {
            logger.info(`📱 Estado de WhatsApp: ${state}`);
        });
    }

    /**
     * Genera imagen QR a partir del código QR
     */
    async generateQR(qrCode) {
        try {
            const qrImageBuffer = await QRCode.toBuffer(qrCode, {
                type: 'png',
                width: 300,
                margin: 2,
                color: {
                    dark: '#000000',
                    light: '#FFFFFF'
                }
            });

            this.qrCode = qrImageBuffer.toString('base64');
            this._isQRGenerated = true;

            logger.info('✅ QR generado exitosamente');
        } catch (error) {
            logger.error('Error generando QR:', error);
            throw error;
        }
    }

    /**
     * Inicializa el servicio de WhatsApp
     */
    async initialize() {
        try {
            logger.info('Inicializando servicio de WhatsApp con whatsapp-web.js...');

            // Si no hay cliente o fue destruido, crear uno nuevo
            if (!this.client) {
                this.setupClient();
            }

            // Inicializar el cliente
            await this.client.initialize();
            logger.info('Cliente de WhatsApp inicializado correctamente');
        } catch (error) {
            logger.error('Error inicializando WhatsApp:', error);
            logger.error('Detalles del error:', {
                message: error.message,
                stack: error.stack,
                name: error.name
            });
            throw error;
        }
    }

    /**
     * Verifica si WhatsApp está conectado (verificación básica)
     */
    isConnected() {
        try {
            // Verificar que el cliente existe y está inicializado
            if (!this.client) {
                return false;
            }

            // Verificar que el estado interno indica conexión
            if (!this._isConnected) {
                return false;
            }

            // Verificar que el cliente tiene información válida
            if (!this.client.info || !this.client.info.wid) {
                return false;
            }

            // Verificar que el cliente no está en proceso de reconexión
            if (this.isReconnecting) {
                return false;
            }

            return true;
        } catch (error) {
            logger.warn('Error verificando estado de conexión:', error.message);
            return false;
        }
    }

    /**
     * Verifica si la conexión está realmente activa (prueba real)
     */
    async isConnectionActive() {
        try {
            // Verificación básica primero
            if (!this.isConnected()) {
                return false;
            }

            // Intentar una operación simple para verificar que la conexión está realmente activa
            try {
                // Verificar que el cliente tiene acceso al estado
                const state = await this.client.getState();
                if (state !== 'CONNECTED') {
                    logger.warn(`Estado de conexión no es CONNECTED: ${state}`);
                    this._isConnected = false;
                    return false;
                }
                return true;
            } catch (error) {
                // Si falla la verificación, la conexión está cerrada
                logger.warn('Conexión inactiva detectada:', error.message);
                this._isConnected = false;
                return false;
            }
        } catch (error) {
            logger.warn('Error verificando conexión activa:', error.message);
            this._isConnected = false;
            return false;
        }
    }

    /**
     * Verifica si el QR está generado
     */
    get isQRGenerated() {
        return this._isQRGenerated;
    }

    /**
     * Obtiene el código QR actual
     */
    getQRCode() {
        return this.qrCode;
    }

    /**
     * Envía un mensaje de texto a un número telefónico
     */
    async sendMessage(message, phoneNumber) {
        try {
            // Verificar conexión real antes de enviar
            const isActive = await this.isConnectionActive();
            if (!isActive) {
                // Intentar reconectar si la conexión está inactiva
                if (!this.isReconnecting) {
                    logger.warn('Conexión inactiva detectada al enviar mensaje, iniciando reconexión...');
                    this.startReconnectionProcess();
                }
                throw new Error('WhatsApp no está conectado o la conexión está inactiva');
            }

            if (!phoneNumber) {
                throw new Error('Número telefónico requerido');
            }

            // Formatear número para WhatsApp (debe incluir código de país sin +)
            // El formato debe ser: código_país + número (ej: 584121234567)
            let formattedNumber = phoneNumber.replace(/[^0-9]/g, ''); // Remover caracteres no numéricos

            // Asegurar que el número tenga el formato correcto para WhatsApp
            // WhatsApp requiere el formato: código_país + número@c.us
            const chatId = `${formattedNumber}@c.us`;

            logger.info(`Enviando mensaje a número: ${formattedNumber}`);

            const result = await this.client.sendMessage(chatId, message);

            logger.info('✅ Mensaje enviado correctamente');
            return {
                success: true,
                messageId: result.id._serialized,
                phoneNumber: formattedNumber
            };
        } catch (error) {
            logger.error('Error enviando mensaje:', error);
            // Si el error indica conexión cerrada, actualizar estado
            if (error.message && error.message.includes('closed state')) {
                this._isConnected = false;
                if (!this.isReconnecting) {
                    this.startReconnectionProcess();
                }
            }
            throw error;
        }
    }


    /**
     * Obtiene información del cliente
     */
    getClientInfo() {
        if (!this.isConnected()) {
            return null;
        }

        return {
            name: this.client.info?.pushname || 'Usuario',
            phone: this.client.info?.wid?._serialized || 'N/A',
            platform: this.client.info?.platform || 'N/A',
            isConnected: this.isConnected()
        };
    }

    /**
     * Limpia las sesiones almacenadas
     */
    async clearSessions() {
        try {
            const files = fs.readdirSync(this.sessionPath);
            for (const file of files) {
                const filePath = path.join(this.sessionPath, file);
                fs.unlinkSync(filePath);
                logger.info(`Sesión eliminada: ${file}`);
            }
            logger.info('Todas las sesiones eliminadas');
        } catch (error) {
            logger.error('Error limpiando sesiones:', error);
        }
    }

    /**
     * Limpia directorios de sesión antiguos (más de 1 hora)
     */
    cleanupOldSessions() {
        try {
            const sessionsBasePath = path.join(__dirname, '../../sessions');

            if (!fs.existsSync(sessionsBasePath)) {
                return;
            }

            const dirs = fs.readdirSync(sessionsBasePath);
            const oneHourAgo = Date.now() - (60 * 60 * 1000);

            for (const dir of dirs) {
                if (dir.startsWith('session-')) {
                    const dirPath = path.join(sessionsBasePath, dir);
                    const stats = fs.statSync(dirPath);

                    if (stats.isDirectory() && stats.mtime.getTime() < oneHourAgo) {
                        try {
                            fs.rmSync(dirPath, { recursive: true, force: true });
                            logger.info(`Directorio de sesión antiguo eliminado: ${dir}`);
                        } catch (err) {
                            logger.warn(`No se pudo eliminar directorio antiguo: ${dir}`);
                        }
                    }
                }
            }
        } catch (error) {
            logger.error('Error limpiando sesiones antiguas:', error);
        }
    }

    /**
     * Inicia el proceso de reconexión automática
     */
    startReconnectionProcess() {
        if (this.isReconnecting || this.reconnectAttempts >= this.maxReconnectAttempts) {
            return;
        }

        this.isReconnecting = true;
        this.reconnectAttempts++;

        logger.info(`🔄 Iniciando reconexión automática (intento ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

        this.reconnectTimer = setTimeout(async () => {
            try {
                await this.reconnect();
            } catch (error) {
                logger.error('Error en reconexión automática:', error);
                this.isReconnecting = false;

                // Si no hemos alcanzado el máximo de intentos, programar otro
                if (this.reconnectAttempts < this.maxReconnectAttempts) {
                    this.startReconnectionProcess();
                } else {
                    logger.error('❌ Máximo de intentos de reconexión alcanzado. Requiere intervención manual.');
                }
            }
        }, this.reconnectInterval);
    }

    /**
     * Intenta reconectar WhatsApp
     */
    async reconnect() {
        try {
            logger.info('🔄 Intentando reconectar WhatsApp...');

            // Detener health check mientras se reconecta
            this.stopPeriodicHealthCheck();

            // Limpiar cliente anterior si existe
            if (this.client) {
                try {
                    await this.client.destroy();
                } catch (error) {
                    logger.warn('Error cerrando cliente anterior:', error.message);
                }
            }

            // Resetear estado
            this._isConnected = false;
            this._isQRGenerated = false;
            this.qrCode = null;
            this.client = null;

            // Crear nuevo cliente
            this.setupClient();
            await this.initialize();

            logger.info('✅ Reconexión exitosa');
            this.isReconnecting = false;
            this.reconnectAttempts = 0; // Resetear contador en caso de éxito

            // Guardar información de sesión después de reconectar
            if (this.databaseService && this.client.info) {
                try {
                    const phoneNumber = this.client.info.wid?.user || null;
                    const phoneName = this.client.info.pushname || null;
                    await this.databaseService.saveSession({
                        sessionId: 'default',
                        phoneNumber: phoneNumber,
                        phoneName: phoneName,
                        status: 'active'
                    });
                    logger.info(`📱 Sesión recuperada después de reconexión: ${phoneName || phoneNumber}`);
                } catch (error) {
                    logger.error('Error guardando sesión después de reconexión:', error);
                }
            }

        } catch (error) {
            logger.error('❌ Error en reconexión:', error);
            this.isReconnecting = false;
            throw error;
        }
    }

    /**
     * Inicia el health check periódico de la conexión
     */
    startPeriodicHealthCheck() {
        // Detener cualquier health check anterior
        this.stopPeriodicHealthCheck();

        this.healthCheckTimer = setInterval(async () => {
            try {
                const isActive = await this.isConnectionActive();
                if (!isActive && !this.isReconnecting) {
                    logger.warn('⚠️ Health check: Conexión inactiva detectada, iniciando reconexión...');
                    this.startReconnectionProcess();
                }
            } catch (error) {
                logger.error('Error en health check periódico:', error);
            }
        }, this.healthCheckInterval);

        logger.info(`🔍 Health check periódico iniciado (cada ${this.healthCheckInterval / 1000} segundos)`);
    }

    /**
     * Detiene el health check periódico
     */
    stopPeriodicHealthCheck() {
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
            this.healthCheckTimer = null;
            logger.info('🛑 Health check periódico detenido');
        }
    }

    /**
     * Detiene el proceso de reconexión automática
     */
    stopReconnectionProcess() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        this.isReconnecting = false;
        this.reconnectAttempts = 0;
        logger.info('🛑 Proceso de reconexión automática detenido');
    }

    /**
     * Cierra la conexión de WhatsApp y limpia la sesión
     */
    async destroy() {
        try {
            // Detener reconexión automática y health check
            this.stopReconnectionProcess();
            this.stopPeriodicHealthCheck();

            if (this.client) {
                await this.client.destroy();
                logger.info('Cliente de WhatsApp cerrado');
            }

            // Limpiar estado
            this._isConnected = false;
            this._isQRGenerated = false;
            this.qrCode = null;
            this.client = null;

            logger.info('Estado de WhatsApp limpiado');

        } catch (error) {
            logger.error('Error cerrando cliente:', error);
        }
    }
    /**
     * Maneja la lógica cuando el cliente está listo
     */
    async _handleReady() {
        if (this._isConnected) return; // Evitar doble ejecución

        logger.info('✅ WhatsApp conectado y listo! (Handler)');
        this._isConnected = true;
        this._isQRGenerated = false;
        this.qrCode = null;
        this.reconnectAttempts = 0;

        // Guardar información de sesión en base de datos
        if (this.databaseService && this.client && this.client.info) {
            try {
                const phoneNumber = this.client.info.wid?.user || null;
                const phoneName = this.client.info.pushname || null;
                await this.databaseService.saveSession({
                    sessionId: 'default',
                    phoneNumber: phoneNumber,
                    phoneName: phoneName,
                    status: 'active'
                });
                logger.info(`📱 Sesión guardada: ${phoneName || phoneNumber}`);
            } catch (error) {
                logger.error('Error guardando sesión:', error);
            }
        }

        // Iniciar health check periódico
        this.startPeriodicHealthCheck();
    }
}

module.exports = WhatsAppService;