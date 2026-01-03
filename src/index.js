/**
 * API de Mensajería WhatsApp
 * Servicio independiente para envío de mensajes vía WhatsApp
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const WhatsAppService = require('./services/whatsappService');
const DatabaseService = require('./services/databaseService');
const logger = require('./utils/logger');

class WhatsAppMessagingAPI {
    constructor() {
        this.app = express();
        this.port = process.env.PORT || 3003;
        this.databaseService = new DatabaseService();
        this.whatsappService = new WhatsAppService(this.databaseService);
        this.jwtSecret = process.env.JWT_SECRET || 'your_jwt_secret_change_this';
        
        this.setupMiddleware();
        this.setupRoutes();
        this.setupErrorHandling();
    }

    /**
     * Configura el middleware de Express
     */
    setupMiddleware() {
        // Configurar trust proxy para Nginx Proxy Manager
        this.app.set('trust proxy', true);
        
        // Seguridad básica
        this.app.use(helmet());
        
        // CORS
        this.app.use(cors({
            origin: process.env.CORS_ORIGIN || '*',
            credentials: true
        }));

        // Parse JSON
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true }));

        // Servir archivos estáticos del dashboard
        this.app.use(express.static(path.join(__dirname, '../assets')));
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
    setupRoutes() {
        // Health check
        this.app.get('/api/health', async (req, res) => {
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
        this.app.post('/api/auth/login', async (req, res) => {
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

        this.app.get('/api/auth/verify', this.authenticateToken.bind(this), (req, res) => {
            res.json({
                success: true,
                data: {
                    user: req.user
                }
            });
        });

        // Endpoint para cambiar contraseña
        this.app.post('/api/auth/change-password', this.authenticateToken.bind(this), async (req, res) => {
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

                // Actualizar contraseña (necesitamos agregar este método al databaseService)
                // Por ahora, usaremos una consulta directa
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
        this.app.get('/api/status', this.authenticateToken.bind(this), (req, res) => {
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
        this.app.get('/api/qr', this.authenticateToken.bind(this), async (req, res) => {
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
        this.app.post('/api/send-message', async (req, res) => {
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

                // Validar campos requeridos
                if (!countryCode || !phoneNumber) {
                    return res.status(400).json({
                        success: false,
                        error: 'countryCode y phoneNumber son requeridos'
                    });
                }

                if (!message || typeof message !== 'string' || message.trim().length === 0) {
                    return res.status(400).json({
                        success: false,
                        error: 'Mensaje requerido'
                    });
                }

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
                const fullNumber = `${countryCode.replace(/[^0-9]/g, '')}${phoneNumber.replace(/[^0-9]/g, '')}`;

                // Enviar mensaje
                const result = await this.whatsappService.sendMessage(message.trim(), fullNumber);
                
                // Guardar en base de datos
                await this.databaseService.logMessage({
                    phoneNumber: phoneNumber.replace(/[^0-9]/g, ''),
                    countryCode: countryCode.replace(/[^0-9]/g, ''),
                    fullNumber: fullNumber,
                    message: message.trim(),
                    status: result.success ? 'sent' : 'failed',
                    messageId: result.messageId || null,
                    error: result.error || null
                });

                res.json({
                    success: result.success,
                    messageId: result.messageId,
                    phoneNumber: fullNumber,
                    error: result.error
                });

            } catch (error) {
                logger.error('Error enviando mensaje:', error);
                
                // Intentar guardar error en BD
                try {
                    const { countryCode, phoneNumber, message } = req.body;
                    if (countryCode && phoneNumber && message) {
                        const fullNumber = `${countryCode.replace(/[^0-9]/g, '')}${phoneNumber.replace(/[^0-9]/g, '')}`;
                        await this.databaseService.logMessage({
                            phoneNumber: phoneNumber.replace(/[^0-9]/g, ''),
                            countryCode: countryCode.replace(/[^0-9]/g, ''),
                            fullNumber: fullNumber,
                            message: message.trim(),
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
        this.app.get('/api/messages', this.authenticateToken.bind(this), async (req, res) => {
            try {
                const limit = parseInt(req.query.limit) || 50;
                const offset = parseInt(req.query.offset) || 0;
                
                const messages = await this.databaseService.getMessageHistory(limit, offset);
                
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
        this.app.get('/api/stats', this.authenticateToken.bind(this), async (req, res) => {
            try {
                const stats = await this.databaseService.getMessageStats();
                
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
        this.app.post('/api/disconnect', this.authenticateToken.bind(this), async (req, res) => {
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
        this.app.post('/api/reconnect', this.authenticateToken.bind(this), async (req, res) => {
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

        // Ruta raíz - servir dashboard
        this.app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, '../assets/dashboard.html'));
        });
    }

    /**
     * Configura el manejo de errores
     */
    setupErrorHandling() {
        // Error 404
        this.app.use('*', (req, res) => {
            res.status(404).json({
                success: false,
                error: 'Endpoint no encontrado'
            });
        });

        // Error handler global
        this.app.use((error, req, res, next) => {
            logger.error('Error no manejado:', error);
            res.status(500).json({
                success: false,
                error: 'Error interno del servidor'
            });
        });
    }

    /**
     * Inicia el servidor
     */
    async start() {
        try {
            // Inicializar base de datos
            await this.databaseService.initialize();

            // Inicializar WhatsApp
            await this.whatsappService.initialize();

            // Iniciar servidor
            this.app.listen(this.port, () => {
                logger.info(`🚀 Servidor WhatsApp Messaging API iniciado en puerto ${this.port}`);
                logger.info(`📱 Dashboard: http://localhost:${this.port}/`);
                logger.info(`💬 Endpoint mensajes: http://localhost:${this.port}/api/send-message`);
                logger.info(`🔍 Estado: http://localhost:${this.port}/api/status`);
            });

        } catch (error) {
            logger.error('Error iniciando servidor:', error);
            process.exit(1);
        }
    }

    /**
     * Detiene el servidor
     */
    async stop() {
        try {
            await this.whatsappService.destroy();
            await this.databaseService.close();
            logger.info('Servidor detenido correctamente');
        } catch (error) {
            logger.error('Error deteniendo servidor:', error);
        }
    }
}

// Manejo de señales del sistema
let app = null;

process.on('SIGINT', async () => {
    logger.info('Recibida señal SIGINT, cerrando servidor...');
    if (app) {
        await app.stop();
    }
    process.exit(0);
});

process.on('SIGTERM', async () => {
    logger.info('Recibida señal SIGTERM, cerrando servidor...');
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
