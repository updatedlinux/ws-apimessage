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
            
            // Crear instancia del bot
            this.bot = new TelegramBot(this.botToken, { polling: false });
            
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
     *   NOTA: Telegram NO permite enviar mensajes a números telefónicos directamente.
     *   El usuario debe haber iniciado conversación con el bot primero.
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

            // Determinar el tipo de identificador
            let telegramChatId;
            
            // Si empieza con @, es un username
            if (typeof identifier === 'string' && identifier.startsWith('@')) {
                telegramChatId = identifier;
                logger.info(`📤 Enviando mensaje de Telegram a username: ${telegramChatId}`);
            } else {
                // Intentar convertir a número (chat_id)
                const numericId = typeof identifier === 'string' 
                    ? identifier.replace(/[^0-9-]/g, '') 
                    : identifier;
                
                // Validar que sea un número válido
                if (!numericId || (numericId === '' && !identifier.toString().startsWith('@'))) {
                    throw new Error('Identificador de Telegram inválido. Debe ser un chat_id (número) o username (@username). Telegram NO permite enviar mensajes a números telefónicos directamente.');
                }
                
                telegramChatId = numericId;
                logger.info(`📤 Enviando mensaje de Telegram a chat_id: ${telegramChatId}`);
            }
            
            const result = await this.bot.sendMessage(telegramChatId, message, {
                parse_mode: 'HTML' // Permite formato HTML básico
            });
            
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
                        userFriendlyMessage = 'Chat no encontrado. El usuario debe iniciar conversación con el bot primero. Telegram NO permite enviar mensajes a números telefónicos directamente. Usa el chat_id o @username del usuario.';
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
     * Cierra la conexión del bot
     */
    async destroy() {
        try {
            if (this.bot) {
                // Telegram Bot API no requiere cierre explícito cuando polling está deshabilitado
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

