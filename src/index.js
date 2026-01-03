/**
 * API de Mensajería WhatsApp
 * Servicio independiente para envío de mensajes vía WhatsApp
 * - API Server en puerto 3000
 * - Dashboard Server en puerto 80
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');

const WhatsAppService = require('./services/whatsappService');
const TelegramService = require('./services/telegramService');
const DatabaseService = require('./services/databaseService');
const logger = require('./utils/logger');

class WhatsAppMessagingAPI {
    constructor() {
        // Servicios compartidos
        this.databaseService = new DatabaseService();
        this.whatsappService = new WhatsAppService(this.databaseService);
        this.telegramService = new TelegramService(this.databaseService);
        this.jwtSecret = process.env.JWT_SECRET || 'your_jwt_secret_change_this';
        
        // Servidor de API (puerto 3000)
        this.apiApp = express();
        this.apiPort = process.env.API_PORT || 3000;
        
        // Servidor de Dashboard (puerto 80)
        this.dashboardApp = express();
        this.dashboardPort = process.env.DASHBOARD_PORT || 80;
        
        this.setupAPIServer();
        this.setupDashboardServer();
    }

    /**
     * Configura el servidor de API (puerto 3000)
     */
    setupAPIServer() {
        // Configurar trust proxy para Nginx Proxy Manager
        this.apiApp.set('trust proxy', true);
        
        // CORS completamente libre
        this.apiApp.use(cors({
            origin: '*',
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key']
        }));

        // Parse JSON
        this.apiApp.use(express.json({ limit: '10mb' }));
        this.apiApp.use(express.urlencoded({ extended: true }));

        // Configurar Swagger
        this.apiApp.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
            customCss: '.swagger-ui .topbar { display: none }',
            customSiteTitle: 'WhatsApp Messaging API - Documentación',
            swaggerOptions: {
                persistAuthorization: true,
                displayRequestDuration: true,
            }
        }));

        // Endpoint para obtener la especificación Swagger en JSON
        this.apiApp.get('/api/docs.json', (req, res) => {
            res.setHeader('Content-Type', 'application/json');
            res.send(swaggerSpec);
        });

        // Configurar rutas de API
        this.setupAPIRoutes();
        this.setupAPIErrorHandling();
    }

    /**
     * Configura el servidor de Dashboard (puerto 80)
     */
    setupDashboardServer() {
        // Configurar trust proxy para Nginx Proxy Manager
        this.dashboardApp.set('trust proxy', true);
        
        // CORS completamente libre
        this.dashboardApp.use(cors({
            origin: '*',
            credentials: true
        }));

        // Servir archivos estáticos del dashboard
        this.dashboardApp.use(express.static(path.join(__dirname, '../assets')));

        // Ruta raíz - servir index.html por defecto
        this.dashboardApp.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, '../assets/index.html'));
        });

        // Manejo de errores del dashboard
        this.dashboardApp.use((req, res) => {
            res.status(404).sendFile(path.join(__dirname, '../assets/index.html'));
        });
    }

    /**
     * Middleware de autenticación JWT
     */
    authenticateToken(req, res, next) {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({
                success: false,
                error: 'Token de autenticación requerido',
                code: 'NO_TOKEN'
            });
        }

        jwt.verify(token, this.jwtSecret, (err, user) => {
            if (err) {
                return res.status(403).json({
                    success: false,
                    error: 'Token inválido o expirado',
                    code: 'INVALID_TOKEN'
                });
            }
            req.user = user;
            next();
        });
    }

    /**
     * Configura las rutas de la API
     */
    setupAPIRoutes() {
        // Health check
        /**
         * @swagger
         * /api/health:
         *   get:
         *     summary: Verifica el estado del servicio
         *     tags: [Health]
         *     responses:
         *       200:
         *         description: Estado del servicio
         *         content:
         *           application/json:
         *             schema:
         *               type: object
         *               properties:
         *                 status:
         *                   type: string
         *                   example: ok
         *                 timestamp:
         *                   type: string
         *                   format: date-time
         *                 uptime:
         *                   type: number
         *                 database:
         *                   type: object
         *                   properties:
         *                     healthy:
         *                       type: boolean
         *                 whatsapp:
         *                   type: object
         *                   properties:
         *                     connected:
         *                       type: boolean
         *                     qrGenerated:
         *                       type: boolean
         */
        this.apiApp.get('/api/health', async (req, res) => {
            try {
                const dbHealth = await this.databaseService.healthCheck();
                const isConnected = this.whatsappService.isConnected();
                
                res.json({
                    status: 'ok',
                    timestamp: new Date().toISOString(),
                    uptime: process.uptime(),
                    database: dbHealth,
                    whatsapp: {
                        connected: isConnected,
                        qrGenerated: this.whatsappService.isQRGenerated
                    }
                });
            } catch (error) {
                logger.error('Error en health check:', error);
                res.status(500).json({
                    status: 'error',
                    timestamp: new Date().toISOString(),
                    error: error.message
                });
            }
        });

        // Endpoints de autenticación
        /**
         * @swagger
         * /api/auth/login:
         *   post:
         *     summary: Inicia sesión y obtiene token JWT
         *     description: Autentica un usuario y devuelve un token JWT que puede usarse para acceder a endpoints protegidos
         *     tags: [Autenticación]
         *     requestBody:
         *       required: true
         *       content:
         *         application/json:
         *           schema:
         *             type: object
         *             required:
         *               - username
         *               - password
         *             properties:
         *               username:
         *                 type: string
         *                 example: admin
         *                 description: Nombre de usuario
         *               password:
         *                 type: string
         *                 format: password
         *                 example: password123
         *                 description: Contraseña del usuario
         *     responses:
         *       200:
         *         description: Login exitoso
         *         content:
         *           application/json:
         *             schema:
         *               type: object
         *               properties:
         *                 success:
         *                   type: boolean
         *                   example: true
         *                 data:
         *                   type: object
         *                   properties:
         *                     token:
         *                       type: string
         *                       description: Token JWT para autenticación
         *                       example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
         *                     user:
         *                       type: object
         *                       properties:
         *                         id:
         *                           type: integer
         *                         username:
         *                           type: string
         *                         email:
         *                           type: string
         *                         fullName:
         *                           type: string
         *       400:
         *         description: Datos inválidos
         *       401:
         *         description: Credenciales inválidas
         */
        this.apiApp.post('/api/auth/login', async (req, res) => {
            try {
                const { username, password } = req.body;

                if (!username || !password) {
                    return res.status(400).json({
                        success: false,
                        error: 'Usuario y contraseña requeridos'
                    });
                }

                const user = await this.databaseService.getUserByUsername(username);
                if (!user) {
                    return res.status(401).json({
                        success: false,
                        error: 'Credenciales inválidas'
                    });
                }

                const validPassword = await bcrypt.compare(password, user.password_hash);
                if (!validPassword) {
                    return res.status(401).json({
                        success: false,
                        error: 'Credenciales inválidas'
                    });
                }

                // Actualizar último login
                await this.databaseService.updateUserLastLogin(username);

                // Generar token JWT
                const token = jwt.sign(
                    { 
                        userId: user.id, 
                        username: user.username 
                    },
                    this.jwtSecret,
                    { expiresIn: '24h' }
                );

                res.json({
                    success: true,
                    data: {
                        token,
                        user: {
                            id: user.id,
                            username: user.username,
                            email: user.email,
                            fullName: user.full_name
                        }
                    }
                });
            } catch (error) {
                logger.error('Error en login:', error);
                res.status(500).json({
                    success: false,
                    error: 'Error interno del servidor'
                });
            }
        });

        /**
         * @swagger
         * /api/auth/verify:
         *   get:
         *     summary: Verifica si el token JWT es válido
         *     tags: [Autenticación]
         *     security:
         *       - bearerAuth: []
         *     responses:
         *       200:
         *         description: Token válido
         *       401:
         *         description: Token no proporcionado
         *       403:
         *         description: Token inválido o expirado
         */
        this.apiApp.get('/api/auth/verify', this.authenticateToken.bind(this), (req, res) => {
            res.json({
                success: true,
                data: {
                    user: req.user
                }
            });
        });

        // Endpoint para cambiar contraseña
        /**
         * @swagger
         * /api/auth/change-password:
         *   post:
         *     summary: Cambia la contraseña del usuario autenticado
         *     tags: [Autenticación]
         *     security:
         *       - bearerAuth: []
         *     requestBody:
         *       required: true
         *       content:
         *         application/json:
         *           schema:
         *             type: object
         *             required:
         *               - currentPassword
         *               - newPassword
         *             properties:
         *               currentPassword:
         *                 type: string
         *                 format: password
         *               newPassword:
         *                 type: string
         *                 format: password
         *                 minLength: 8
         *     responses:
         *       200:
         *         description: Contraseña actualizada correctamente
         *       400:
         *         description: Datos inválidos o contraseña muy corta
         *       401:
         *         description: Contraseña actual incorrecta o token inválido
         */
        this.apiApp.post('/api/auth/change-password', this.authenticateToken.bind(this), async (req, res) => {
            try {
                const { currentPassword, newPassword } = req.body;
                const userId = req.user.userId;

                if (!currentPassword || !newPassword) {
                    return res.status(400).json({
                        success: false,
                        error: 'Contraseña actual y nueva contraseña requeridas'
                    });
                }

                if (newPassword.length < 8) {
                    return res.status(400).json({
                        success: false,
                        error: 'La nueva contraseña debe tener al menos 8 caracteres'
                    });
                }

                // Obtener usuario
                const user = await this.databaseService.getUserByUsername(req.user.username);
                if (!user) {
                    return res.status(404).json({
                        success: false,
                        error: 'Usuario no encontrado'
                    });
                }

                // Verificar contraseña actual
                const validPassword = await bcrypt.compare(currentPassword, user.password_hash);
                if (!validPassword) {
                    return res.status(401).json({
                        success: false,
                        error: 'Contraseña actual incorrecta'
                    });
                }

                // Hashear nueva contraseña
                const newPasswordHash = await bcrypt.hash(newPassword, 10);

                // Actualizar contraseña
                await this.databaseService.connection.execute(
                    'UPDATE ws_users SET password_hash = ? WHERE id = ?',
                    [newPasswordHash, userId]
                );

                res.json({
                    success: true,
                    message: 'Contraseña actualizada correctamente'
                });
            } catch (error) {
                logger.error('Error cambiando contraseña:', error);
                res.status(500).json({
                    success: false,
                    error: 'Error interno del servidor'
                });
            }
        });

        // Obtener estado de conexión (requiere autenticación)
        /**
         * @swagger
         * /api/status:
         *   get:
         *     summary: Obtiene el estado de la conexión de WhatsApp
         *     tags: [WhatsApp]
         *     security:
         *       - bearerAuth: []
         *     responses:
         *       200:
         *         description: Estado de la conexión
         *         content:
         *           application/json:
         *             schema:
         *               type: object
         *               properties:
         *                 success:
         *                   type: boolean
         *                 data:
         *                   type: object
         *                   properties:
         *                     connected:
         *                       type: boolean
         *                     qrGenerated:
         *                       type: boolean
         *                     clientInfo:
         *                       type: object
         *                       nullable: true
         */
        this.apiApp.get('/api/status', this.authenticateToken.bind(this), (req, res) => {
            try {
                const clientInfo = this.whatsappService.getClientInfo();
                const status = {
                    connected: this.whatsappService.isConnected(),
                    qrGenerated: this.whatsappService.isQRGenerated,
                    clientInfo: clientInfo
                };
                res.json({ success: true, data: status });
            } catch (error) {
                logger.error('Error obteniendo estado:', error);
                res.status(500).json({ success: false, error: 'Error interno del servidor' });
            }
        });

        // Obtener QR para conexión (requiere autenticación)
        /**
         * @swagger
         * /api/qr:
         *   get:
         *     summary: Obtiene el código QR para conectar WhatsApp
         *     tags: [WhatsApp]
         *     security:
         *       - bearerAuth: []
         *     responses:
         *       200:
         *         description: QR code generado o ya conectado
         *         content:
         *           application/json:
         *             schema:
         *               type: object
         *               properties:
         *                 success:
         *                   type: boolean
         *                 connected:
         *                   type: boolean
         *                 qr:
         *                   type: string
         *                   format: base64
         *                   description: Imagen QR en base64 (solo si no está conectado)
         *                 expiresAt:
         *                   type: string
         *                   format: date-time
         *                 message:
         *                   type: string
         *       404:
         *         description: QR no disponible
         */
        this.apiApp.get('/api/qr', this.authenticateToken.bind(this), async (req, res) => {
            try {
                if (this.whatsappService.isConnected()) {
                    return res.json({
                        success: true,
                        connected: true,
                        message: 'WhatsApp ya está conectado'
                    });
                }

                const qrData = this.whatsappService.getQRCode();
                if (!qrData) {
                    return res.status(404).json({
                        success: false,
                        error: 'QR no disponible. Intenta reconectar.'
                    });
                }

                res.json({
                    success: true,
                    connected: false,
                    qr: qrData,
                    expiresAt: new Date(Date.now() + 60000).toISOString()
                });
            } catch (error) {
                logger.error('Error obteniendo QR:', error);
                res.status(500).json({ success: false, error: 'Error generando QR' });
            }
        });

        // Endpoint principal: Enviar mensaje
        /**
         * @swagger
         * /api/send-message:
         *   post:
         *     summary: Envía un mensaje vía WhatsApp a un número telefónico
         *     description: Envía un mensaje de texto a un número telefónico individual usando WhatsApp. Requiere que WhatsApp esté conectado.
         *     tags: [Mensajes]
         *     security:
         *       - apiKey: []
         *     requestBody:
         *       required: true
         *       content:
         *         application/json:
         *           schema:
         *             type: object
         *             required:
         *               - countryCode
         *               - phoneNumber
         *               - message
         *             properties:
         *               countryCode:
         *                 type: string
         *                 example: "+58"
         *                 description: Código de país con el signo + (requerido solo para WHATSAPP, opcional para TELEGRAM)
         *               phoneNumber:
         *                 type: string
         *                 example: "4121234567"
         *                 description: |
         *                   Para WHATSAPP: Número telefónico sin código de país.
         *                   Para TELEGRAM: chat_id (número) o @username del usuario.
         *                   IMPORTANTE: Telegram NO permite enviar mensajes a números telefónicos directamente.
         *                   El usuario debe haber iniciado conversación con el bot primero.
         *                   Ejemplos válidos para Telegram: "123456789" (chat_id) o "@username" (username).
         *               channel:
         *                 type: string
         *                 example: "WHATSAPP"
         *                 description: Canal de envío (WHATSAPP o TELEGRAM)
         *                 enum: [WHATSAPP, TELEGRAM]
         *                 default: WHATSAPP
         *               message:
         *                 type: string
         *                 example: "Hola, este es un mensaje de prueba"
         *                 description: Contenido del mensaje a enviar
         *               secretKey:
         *                 type: string
         *                 description: Clave de API (alternativa al header X-API-Key)
         *     responses:
         *       200:
         *         description: Mensaje enviado exitosamente
         *         content:
         *           application/json:
         *             schema:
         *               type: object
         *               properties:
         *                 success:
         *                   type: boolean
         *                   example: true
         *                 messageId:
         *                   type: string
         *                   example: "3EB0C767F26CXXXXX"
         *                 phoneNumber:
         *                   type: string
         *                   example: "584121234567"
         *                 channel:
         *                   type: string
         *                   example: "WHATSAPP"
         *                   description: Canal usado para enviar el mensaje
         *                 error:
         *                   type: string
         *                   nullable: true
         *       400:
         *         description: Datos inválidos o faltantes
         *       401:
         *         description: Clave de API inválida
         *       503:
         *         description: WhatsApp o Telegram no está conectado (según el channel especificado)
         */
        this.apiApp.post('/api/send-message', async (req, res) => {
            try {
                const { countryCode, phoneNumber, channel, message } = req.body;

                // Validar secret key (opcional, puede usar JWT también)
                const secretKey = req.headers['x-api-key'] || req.body.secretKey;
                if (secretKey && secretKey !== process.env.API_SECRET_KEY) {
                    return res.status(401).json({
                        success: false,
                        error: 'Clave de API inválida'
                    });
                }

                // Determinar el canal (default: WHATSAPP)
                const messageChannel = (channel || 'WHATSAPP').toUpperCase();
                
                // Validar campos requeridos según el canal
                if (messageChannel === 'TELEGRAM') {
                    // Para Telegram, solo phoneNumber es requerido (puede ser chat_id o @username)
                    if (!phoneNumber) {
                        return res.status(400).json({
                            success: false,
                            error: 'phoneNumber es requerido para Telegram (debe ser chat_id o @username)'
                        });
                    }
                } else {
                    // Para WhatsApp, ambos son requeridos
                    if (!countryCode || !phoneNumber) {
                        return res.status(400).json({
                            success: false,
                            error: 'countryCode y phoneNumber son requeridos para WhatsApp'
                        });
                    }
                }

                if (!message || typeof message !== 'string' || message.trim().length === 0) {
                    return res.status(400).json({
                        success: false,
                        error: 'Mensaje requerido'
                    });
                }
                
                if (messageChannel !== 'WHATSAPP' && messageChannel !== 'TELEGRAM') {
                    return res.status(400).json({
                        success: false,
                        error: 'Channel inválido. Debe ser WHATSAPP o TELEGRAM'
                    });
                }

                let result;
                let fullNumber;
                let chatId;

                // Enviar mensaje según el canal
                if (messageChannel === 'TELEGRAM') {
                    // Para Telegram, el phoneNumber puede ser:
                    // - Un chat_id (número de Telegram, no número telefónico)
                    // - Un username de Telegram (ej: @username)
                    // NOTA: Telegram NO permite enviar mensajes a números telefónicos directamente.
                    // El usuario debe haber iniciado conversación con el bot primero.
                    
                    // Si empieza con @, es un username, si no, tratarlo como chat_id
                    let telegramIdentifier = phoneNumber.trim();
                    
                    // Si no empieza con @ y parece un número telefónico (muy largo), advertir
                    if (!telegramIdentifier.startsWith('@') && telegramIdentifier.length > 10) {
                        logger.warn(`⚠️ Advertencia: Se está usando un identificador largo para Telegram. Asegúrate de que sea un chat_id válido, no un número telefónico. Telegram requiere que el usuario inicie conversación primero.`);
                    }
                    
                    // Verificar conexión de Telegram
                    const isTelegramActive = await this.telegramService.isConnectionActive();
                    if (!isTelegramActive) {
                        return res.status(503).json({
                            success: false,
                            error: 'Telegram bot no está conectado. Verifica el TELEGRAM_BOT_TOKEN en la configuración.'
                        });
                    }

                    // Enviar mensaje por Telegram
                    result = await this.telegramService.sendMessage(message.trim(), telegramIdentifier);
                    fullNumber = telegramIdentifier; // Guardar el identificador usado (chat_id o username)
                } else {
                    // WhatsApp (comportamiento original)
                    // Verificar conexión
                    const isActive = await this.whatsappService.isConnectionActive();
                    if (!isActive) {
                        if (this.whatsappService.isConnected() && !this.whatsappService.isReconnecting) {
                            logger.warn('Conexión inactiva detectada, iniciando reconexión...');
                            this.whatsappService.startReconnectionProcess();
                        }
                        return res.status(503).json({
                            success: false,
                            error: 'WhatsApp no está conectado o la conexión está inactiva. Escanea el QR o espera a la reconexión automática.',
                            reconnecting: this.whatsappService.isReconnecting
                        });
                    }

                    // Formatear número completo (sin +)
                    fullNumber = `${countryCode.replace(/[^0-9]/g, '')}${phoneNumber.replace(/[^0-9]/g, '')}`;

                    // Enviar mensaje
                    result = await this.whatsappService.sendMessage(message.trim(), fullNumber);
                }
                
                // Guardar en base de datos
                // Para Telegram, phoneNumber puede ser un chat_id o username, no necesariamente un número
                const dbPhoneNumber = messageChannel === 'TELEGRAM' 
                    ? phoneNumber.trim() // Mantener tal cual (puede ser @username o chat_id)
                    : phoneNumber.replace(/[^0-9]/g, ''); // Para WhatsApp, solo números
                
                await this.databaseService.logMessage({
                    phoneNumber: dbPhoneNumber,
                    countryCode: messageChannel === 'TELEGRAM' ? '' : (countryCode ? countryCode.replace(/[^0-9]/g, '') : ''),
                    fullNumber: fullNumber,
                    message: message.trim(),
                    channel: messageChannel,
                    status: result.success ? 'sent' : 'failed',
                    messageId: result.messageId || null,
                    error: result.error || null
                });

                res.json({
                    success: result.success,
                    messageId: result.messageId,
                    phoneNumber: fullNumber,
                    channel: messageChannel,
                    error: result.error
                });

            } catch (error) {
                logger.error('Error enviando mensaje:', error);
                
                // Intentar guardar error en BD
                try {
                    const { countryCode, phoneNumber, message, channel } = req.body;
                    if (phoneNumber && message) {
                        const messageChannel = (channel || 'WHATSAPP').toUpperCase();
                        const dbPhoneNumber = messageChannel === 'TELEGRAM' 
                            ? phoneNumber.trim()
                            : phoneNumber.replace(/[^0-9]/g, '');
                        const fullNumber = messageChannel === 'TELEGRAM'
                            ? phoneNumber.trim()
                            : `${countryCode ? countryCode.replace(/[^0-9]/g, '') : ''}${phoneNumber.replace(/[^0-9]/g, '')}`;
                        await this.databaseService.logMessage({
                            phoneNumber: dbPhoneNumber,
                            countryCode: messageChannel === 'TELEGRAM' ? '' : (countryCode ? countryCode.replace(/[^0-9]/g, '') : ''),
                            fullNumber: fullNumber,
                            message: message.trim(),
                            channel: messageChannel,
                            status: 'failed',
                            error: error.message
                        });
                    }
                } catch (dbError) {
                    logger.error('Error guardando mensaje fallido en BD:', dbError);
                }

                res.status(500).json({
                    success: false,
                    error: 'Error interno enviando mensaje',
                    details: error.message
                });
            }
        });

        // Obtener historial de mensajes (requiere autenticación)
        /**
         * @swagger
         * /api/messages:
         *   get:
         *     summary: Obtiene el historial de mensajes enviados
         *     tags: [Mensajes]
         *     security:
         *       - bearerAuth: []
         *     parameters:
         *       - in: query
         *         name: limit
         *         schema:
         *           type: integer
         *           default: 50
         *         description: Número máximo de mensajes a retornar
         *       - in: query
         *         name: offset
         *         schema:
         *           type: integer
         *           default: 0
         *         description: Offset para paginación
         *       - in: query
         *         name: channel
         *         schema:
         *           type: string
         *           enum: [WHATSAPP, TELEGRAM]
         *         description: Filtrar mensajes por canal (opcional)
         *     responses:
         *       200:
         *         description: Lista de mensajes
         *         content:
         *           application/json:
         *             schema:
         *               type: object
         *               properties:
         *                 success:
         *                   type: boolean
         *                 data:
         *                   type: array
         *                   items:
         *                     type: object
         *                 pagination:
         *                   type: object
         */
        this.apiApp.get('/api/messages', this.authenticateToken.bind(this), async (req, res) => {
            try {
                const limit = parseInt(req.query.limit) || 50;
                const offset = parseInt(req.query.offset) || 0;
                const channel = req.query.channel || null; // Filtro opcional por canal
                
                const messages = await this.databaseService.getMessageHistory(limit, offset, channel);
                
                res.json({
                    success: true,
                    data: messages,
                    pagination: {
                        limit,
                        offset,
                        total: messages.length
                    }
                });
            } catch (error) {
                logger.error('Error obteniendo mensajes:', error);
                res.status(500).json({
                    success: false,
                    error: 'Error obteniendo historial de mensajes'
                });
            }
        });

        // Obtener estadísticas (requiere autenticación)
        /**
         * @swagger
         * /api/stats:
         *   get:
         *     summary: Obtiene estadísticas de mensajes
         *     tags: [Estadísticas]
         *     security:
         *       - bearerAuth: []
         *     parameters:
         *       - in: query
         *         name: channel
         *         schema:
         *           type: string
         *           enum: [WHATSAPP, TELEGRAM]
         *         description: Filtrar estadísticas por canal (opcional)
         *     responses:
         *       200:
         *         description: Estadísticas de mensajes
         *         content:
         *           application/json:
         *             schema:
         *               type: object
         *               properties:
         *                 success:
         *                   type: boolean
         *                 data:
         *                   type: array
         *                   items:
         *                     type: object
         *                     properties:
         *                       status:
         *                         type: string
         *                         enum: [sent, failed, pending]
         *                       count:
         *                         type: string
         */
        this.apiApp.get('/api/stats', this.authenticateToken.bind(this), async (req, res) => {
            try {
                const channel = req.query.channel || null; // Filtro opcional por canal
                const stats = await this.databaseService.getMessageStats(channel);
                
                res.json({
                    success: true,
                    data: stats
                });
            } catch (error) {
                logger.error('Error obteniendo estadísticas:', error);
                res.status(500).json({
                    success: false,
                    error: 'Error obteniendo estadísticas'
                });
            }
        });

        // Desconectar WhatsApp (requiere autenticación)
        /**
         * @swagger
         * /api/disconnect:
         *   post:
         *     summary: Desconecta WhatsApp manualmente
         *     description: Desconecta la sesión de WhatsApp y genera un nuevo QR para reconectar
         *     tags: [WhatsApp]
         *     security:
         *       - bearerAuth: []
         *     responses:
         *       200:
         *         description: WhatsApp desconectado correctamente
         *       500:
         *         description: Error interno del servidor
         */
        this.apiApp.post('/api/disconnect', this.authenticateToken.bind(this), async (req, res) => {
            try {
                await this.whatsappService.destroy();
                
                logger.info('WhatsApp desconectado manualmente');
                
                // Reinicializar para generar nuevo QR
                setTimeout(async () => {
                    try {
                        await this.whatsappService.setupClient();
                        await this.whatsappService.initialize();
                        logger.info('WhatsApp reinicializado para generar nuevo QR');
                    } catch (error) {
                        logger.error('Error reinicializando WhatsApp:', error);
                    }
                }, 3000);
                
                res.json({
                    success: true,
                    message: 'WhatsApp desconectado correctamente'
                });

            } catch (error) {
                logger.error('Error desconectando WhatsApp:', error);
                res.status(500).json({ 
                    success: false, 
                    error: 'Error interno del servidor' 
                });
            }
        });

        // Forzar reconexión (requiere autenticación)
        /**
         * @swagger
         * /api/reconnect:
         *   post:
         *     summary: Fuerza la reconexión de WhatsApp
         *     description: Inicia el proceso de reconexión manual de WhatsApp
         *     tags: [WhatsApp]
         *     security:
         *       - bearerAuth: []
         *     responses:
         *       200:
         *         description: Reconexión iniciada correctamente
         *         content:
         *           application/json:
         *             schema:
         *               type: object
         *               properties:
         *                 success:
         *                   type: boolean
         *                 message:
         *                   type: string
         *                 connected:
         *                   type: boolean
         *       500:
         *         description: Error iniciando reconexión
         */
        this.apiApp.post('/api/reconnect', this.authenticateToken.bind(this), async (req, res) => {
            try {
                logger.info('🔄 Reconexión manual iniciada...');
                
                this.whatsappService.stopReconnectionProcess();
                await this.whatsappService.reconnect();
                
                res.json({
                    success: true,
                    message: 'Reconexión iniciada correctamente',
                    connected: this.whatsappService.isConnected()
                });

            } catch (error) {
                logger.error('Error en reconexión manual:', error);
                res.status(500).json({
                    success: false,
                    error: 'Error iniciando reconexión'
                });
            }
        });
    }

    /**
     * Configura el manejo de errores de la API
     */
    setupAPIErrorHandling() {
        // Error 404
        this.apiApp.use('*', (req, res) => {
            res.status(404).json({
                success: false,
                error: 'Endpoint no encontrado'
            });
        });

        // Error handler global
        this.apiApp.use((error, req, res, next) => {
            logger.error('Error no manejado:', error);
            res.status(500).json({
                success: false,
                error: 'Error interno del servidor'
            });
        });
    }

    /**
     * Inicia ambos servidores
     */
    async start() {
        try {
            // Inicializar base de datos
            await this.databaseService.initialize();

            // Inicializar WhatsApp
            await this.whatsappService.initialize();

            // Inicializar Telegram (si está configurado)
            if (process.env.TELEGRAM_BOT_TOKEN) {
                this.telegramService.initialize();
                logger.info('🤖 Servicio de Telegram inicializado');
            } else {
                logger.warn('⚠️ Telegram Bot Token no configurado. El servicio de Telegram no estará disponible.');
            }

            // Iniciar servidor de API (puerto 3000)
            this.apiApp.listen(this.apiPort, () => {
                logger.info(`🚀 API Server iniciado en puerto ${this.apiPort}`);
                logger.info(`💬 Endpoint mensajes: http://localhost:${this.apiPort}/api/send-message`);
                logger.info(`🔍 Health check: http://localhost:${this.apiPort}/api/health`);
                logger.info(`📚 Swagger Docs: http://localhost:${this.apiPort}/api/docs`);
            });

            // Iniciar servidor de Dashboard (puerto 80)
            this.dashboardApp.listen(this.dashboardPort, () => {
                logger.info(`📱 Dashboard Server iniciado en puerto ${this.dashboardPort}`);
                logger.info(`🌐 Dashboard: http://localhost:${this.dashboardPort}/`);
            });

            logger.info(`\n✅ Servidores iniciados correctamente`);
            logger.info(`   API: http://localhost:${this.apiPort}`);
            logger.info(`   Dashboard: http://localhost:${this.dashboardPort}\n`);

        } catch (error) {
            logger.error('Error iniciando servidores:', error);
            process.exit(1);
        }
    }

    /**
     * Detiene ambos servidores
     */
    async stop() {
        try {
            await this.whatsappService.destroy();
            await this.databaseService.close();
            logger.info('Servidores detenidos correctamente');
        } catch (error) {
            logger.error('Error deteniendo servidores:', error);
        }
    }
}

// Manejo de señales del sistema
let app = null;

process.on('SIGINT', async () => {
    logger.info('Recibida señal SIGINT, cerrando servidores...');
    if (app) {
        await app.stop();
    }
    process.exit(0);
});

process.on('SIGTERM', async () => {
    logger.info('Recibida señal SIGTERM, cerrando servidores...');
    if (app) {
        await app.stop();
    }
    process.exit(0);
});

// Iniciar aplicación
app = new WhatsAppMessagingAPI();
app.start().catch(error => {
    logger.error('Error fatal:', error);
    process.exit(1);
});

module.exports = WhatsAppMessagingAPI;
