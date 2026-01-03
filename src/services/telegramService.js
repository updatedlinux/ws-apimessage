/**
 * Servicio de Telegram usando node-telegram-bot-api
 * Maneja el envío de mensajes vía Telegram Bot API
 */

const TelegramBot = require('node-telegram-bot-api');
const logger = require('../utils/logger');

class TelegramService {
    constructor(databaseService = null) {
        this.bot = null;
        this.botToken = process.env.TELEGRAM_BOT_TOKEN || '';
        this.databaseService = databaseService;
        this._isConnected = false;
        
        if (this.botToken) {
            this.initialize();
        } else {
            logger.warn('⚠️ Telegram Bot Token no configurado. El servicio de Telegram no estará disponible.');
        }
    }

    /**
     * Inicializa el bot de Telegram
     */
    initialize() {
        try {
            if (!this.botToken) {
                logger.warn('Telegram Bot Token no configurado');
                return;
            }

            logger.info('🤖 Inicializando bot de Telegram...');
            
            // Crear instancia del bot con polling habilitado para recibir mensajes
            this.bot = new TelegramBot(this.botToken, { 
                polling: {
                    interval: 1000,
                    autoStart: true,
                    params: {
                        timeout: 10
                    }
                }
            });
            
            // Configurar handlers para recibir mensajes
            this.setupMessageHandlers();
            
            // Verificar que el bot es válido obteniendo información
            this.bot.getMe().then((botInfo) => {
                this._isConnected = true;
                logger.info(`✅ Bot de Telegram conectado: @${botInfo.username} (${botInfo.first_name})`);
                
                // Guardar información del bot en la base de datos
                if (this.databaseService) {
                    this.databaseService.saveSession({
                        sessionId: 'telegram',
                        phoneNumber: botInfo.id.toString(),
                        phoneName: botInfo.first_name,
                        status: 'active'
                    }).catch(err => {
                        logger.error('Error guardando sesión de Telegram:', err);
                    });
                }
            }).catch((error) => {
                logger.error('❌ Error conectando bot de Telegram:', error.message);
                this._isConnected = false;
            });

        } catch (error) {
            logger.error('❌ Error inicializando Telegram:', error);
            this._isConnected = false;
        }
    }

    /**
     * Verifica si el bot está conectado
     */
    isConnected() {
        return this._isConnected && this.bot !== null;
    }

    /**
     * Verifica si la conexión está activa
     */
    async isConnectionActive() {
        try {
            if (!this.isConnected()) {
                return false;
            }

            // Intentar obtener información del bot para verificar conexión
            await this.bot.getMe();
            return true;
        } catch (error) {
            logger.warn('Conexión de Telegram inactiva:', error.message);
            this._isConnected = false;
            return false;
        }
    }

    /**
     * Envía un mensaje a un chat de Telegram
     * @param {string} message - Mensaje a enviar
     * @param {string|number} identifier - Puede ser:
     *   - chat_id (número): ID numérico del chat de Telegram
     *   - username (string): Nombre de usuario de Telegram (ej: @username)
     *   - phoneNumber: Número telefónico (si el usuario está registrado en la BD)
     *   - email: Email (si el usuario está registrado en la BD)
     *   - customIdentifier: Identificador personalizado (si el usuario está registrado en la BD)
     *   NOTA: Para usar phoneNumber, email o customIdentifier, el usuario debe haber escrito al bot primero.
     * @returns {Promise<Object>} Resultado del envío
     */
    async sendMessage(message, identifier) {
        try {
            if (!this.isConnected()) {
                // Intentar reconectar si no está conectado
                if (!this._isConnected) {
                    this.initialize();
                    // Esperar un momento para que se conecte
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
                
                if (!this.isConnected()) {
                    throw new Error('Telegram bot no está conectado. Verifica el TELEGRAM_BOT_TOKEN en el .env');
                }
            }

            // Verificar conexión activa
            const isActive = await this.isConnectionActive();
            if (!isActive) {
                throw new Error('Conexión de Telegram inactiva');
            }

            // Determinar el tipo de identificador y obtener chat_id
            let telegramChatId;
            
            // Si empieza con @, es un username - intentar usarlo directamente primero
            if (typeof identifier === 'string' && identifier.startsWith('@')) {
                // Intentar primero con el username directamente
                try {
                    telegramChatId = identifier;
                    logger.info(`📤 Intentando enviar mensaje de Telegram a username: ${telegramChatId}`);
                    // Intentaremos enviar directamente, si falla, buscaremos en BD
                } catch (e) {
                    // Si falla, buscar en BD
                    const foundChatId = await this.findChatIdByIdentifier(identifier);
                    if (foundChatId) {
                        telegramChatId = foundChatId;
                        logger.info(`✅ Usuario encontrado en BD: ${identifier} -> chat_id=${telegramChatId}`);
                    } else {
                        throw new Error(`Usuario ${identifier} no encontrado. El usuario debe escribir al bot primero para ser registrado.`);
                    }
                }
            } else {
                // Verificar si es un número (chat_id directo)
                const numericId = typeof identifier === 'string' 
                    ? identifier.replace(/[^0-9-]/g, '') 
                    : identifier.toString();
                
                // Si parece un chat_id (número corto, típicamente 9-10 dígitos)
                if (numericId && numericId.length <= 12 && /^-?\d+$/.test(numericId)) {
                    telegramChatId = numericId;
                    logger.info(`📤 Enviando mensaje de Telegram a chat_id: ${telegramChatId}`);
                } else {
                    // Buscar en la base de datos por phoneNumber, email o customIdentifier
                    const foundChatId = await this.findChatIdByIdentifier(identifier);
                    if (foundChatId) {
                        telegramChatId = foundChatId;
                        logger.info(`✅ Usuario encontrado en BD: ${identifier} -> chat_id=${telegramChatId}`);
                    } else {
                        throw new Error(`Usuario con identificador "${identifier}" no encontrado. El usuario debe escribir al bot primero (o compartir su contacto) para ser registrado.`);
                    }
                }
            }
            
            // Intentar enviar el mensaje
            let result;
            try {
                result = await this.bot.sendMessage(telegramChatId, message, {
                    parse_mode: 'HTML' // Permite formato HTML básico
                });
            } catch (sendError) {
                // Si falla con username, intentar buscar en BD
                if (typeof identifier === 'string' && identifier.startsWith('@') && telegramChatId === identifier) {
                    const foundChatId = await this.findChatIdByIdentifier(identifier);
                    if (foundChatId) {
                        telegramChatId = foundChatId;
                        logger.info(`🔄 Reintentando con chat_id encontrado en BD: ${telegramChatId}`);
                        result = await this.bot.sendMessage(telegramChatId, message, {
                            parse_mode: 'HTML'
                        });
                    } else {
                        throw sendError; // Re-lanzar el error original
                    }
                } else {
                    throw sendError; // Re-lanzar el error original
                }
            }
            
            logger.info('✅ Mensaje de Telegram enviado correctamente');
            
            return {
                success: true,
                messageId: result.message_id.toString(),
                chatId: telegramChatId,
                channel: 'TELEGRAM'
            };
        } catch (error) {
            logger.error('❌ Error enviando mensaje de Telegram:', error);
            
            // Errores comunes de Telegram
            let errorMessage = error.message;
            let userFriendlyMessage = errorMessage;
            
            if (error.response) {
                const errorCode = error.response.error_code;
                const description = error.response.description;
                
                if (errorCode === 403) {
                    userFriendlyMessage = 'El bot fue bloqueado por el usuario o no tiene permisos para enviar mensajes';
                } else if (errorCode === 400) {
                    if (description && description.includes('chat not found')) {
                        userFriendlyMessage = `Usuario "${identifier}" no encontrado. El usuario debe escribir al bot primero para ser registrado. Una vez que el usuario escriba al bot, podrás enviarle mensajes usando su @username, número telefónico, o cualquier identificador que hayas asociado.`;
                    } else {
                        userFriendlyMessage = `Chat inválido: ${description}`;
                    }
                } else if (errorCode === 429) {
                    userFriendlyMessage = 'Límite de rate limit alcanzado en Telegram. Espera unos momentos antes de intentar nuevamente.';
                } else {
                    userFriendlyMessage = description || error.message;
                }
            }
            
            return {
                success: false,
                error: userFriendlyMessage,
                chatId: identifier,
                channel: 'TELEGRAM'
            };
        }
    }

    /**
     * Obtiene información del bot
     */
    async getBotInfo() {
        try {
            if (!this.isConnected()) {
                return null;
            }

            const botInfo = await this.bot.getMe();
            return {
                id: botInfo.id,
                username: botInfo.username,
                firstName: botInfo.first_name,
                isConnected: this.isConnected()
            };
        } catch (error) {
            logger.error('Error obteniendo información del bot:', error);
            return null;
        }
    }

    /**
     * Configura los handlers para recibir mensajes de usuarios
     */
    setupMessageHandlers() {
        if (!this.bot) return;

        // Handler para mensajes de texto
        this.bot.on('message', async (msg) => {
            try {
                const chatId = msg.chat.id.toString();
                const username = msg.from.username ? `@${msg.from.username}` : null;
                const phoneNumber = msg.contact ? msg.contact.phone_number : null;
                const firstName = msg.from.first_name || null;
                const lastName = msg.from.last_name || null;

                logger.info(`📩 Mensaje recibido de Telegram: chat_id=${chatId}, username=${username || 'N/A'}`);

                // Guardar/actualizar usuario en la base de datos
                if (this.databaseService) {
                    await this.databaseService.saveTelegramUser({
                        chatId: chatId,
                        username: username,
                        phoneNumber: phoneNumber,
                        email: null, // Telegram no proporciona email directamente
                        customIdentifier: null,
                        firstName: firstName,
                        lastName: lastName
                    });
                }

                // Opcional: Responder automáticamente al usuario
                // Puedes personalizar este mensaje según tus necesidades
                const welcomeMessage = `¡Hola! 👋\n\nGracias por escribirme. Tu chat_id ha sido registrado: ${chatId}\n\nAhora puedes recibir notificaciones a través de este bot.`;
                
                await this.bot.sendMessage(chatId, welcomeMessage);
                logger.info(`✅ Respuesta automática enviada a chat_id=${chatId}`);
            } catch (error) {
                logger.error('Error procesando mensaje de Telegram:', error);
            }
        });

        // Handler para cuando un usuario comparte su contacto
        this.bot.on('contact', async (msg) => {
            try {
                const chatId = msg.chat.id.toString();
                const contact = msg.contact;
                
                if (this.databaseService && contact) {
                    await this.databaseService.saveTelegramUser({
                        chatId: chatId,
                        username: msg.from.username ? `@${msg.from.username}` : null,
                        phoneNumber: contact.phone_number,
                        email: null,
                        customIdentifier: null,
                        firstName: contact.first_name || msg.from.first_name || null,
                        lastName: contact.last_name || msg.from.last_name || null
                    });
                    
                    logger.info(`📞 Contacto recibido: chat_id=${chatId}, phone=${contact.phone_number}`);
                }
            } catch (error) {
                logger.error('Error procesando contacto de Telegram:', error);
            }
        });

        logger.info('✅ Handlers de mensajes de Telegram configurados');
    }

    /**
     * Busca el chat_id de un usuario por identificador
     * @param {string} identifier - username (@username), phoneNumber, email, o customIdentifier
     * @returns {Promise<string|null>} chat_id o null si no se encuentra
     */
    async findChatIdByIdentifier(identifier) {
        if (!this.databaseService) {
            return null;
        }
        return await this.databaseService.findTelegramChatId(identifier);
    }

    /**
     * Cierra la conexión del bot
     */
    async destroy() {
        try {
            if (this.bot) {
                // Detener polling si está activo
                if (this.bot.stopPolling) {
                    this.bot.stopPolling();
                }
                this.bot = null;
                this._isConnected = false;
                logger.info('Bot de Telegram desconectado');
            }
        } catch (error) {
            logger.error('Error cerrando bot de Telegram:', error);
        }
    }
}

module.exports = TelegramService;

