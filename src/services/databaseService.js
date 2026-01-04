/**
 * Servicio de base de datos para WhatsApp Messaging API
 * Maneja la persistencia de configuración, mensajes y usuarios
 */

const mysql = require('mysql2/promise');
const logger = require('../utils/logger');

class DatabaseService {
    constructor() {
        this.pool = null;
        this.config = {
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'whatsapp_user',
            password: process.env.DB_PASSWORD || 'your_password',
            database: process.env.DB_NAME || 'whatsapp_messaging',
            port: process.env.DB_PORT || 3306,
            charset: 'utf8mb4',
            timezone: '+00:00',
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0,
            enableKeepAlive: true,
            keepAliveInitialDelay: 0
        };
    }

    /**
     * Inicializa el pool de conexiones a la base de datos
     */
    async initialize() {
        try {
            this.pool = mysql.createPool(this.config);
            logger.info('Pool de conexiones a base de datos establecido');

            // Verificar conexión y crear tablas si no existen
            const connection = await this.pool.getConnection();
            try {
                await this.createTables(connection);
            } finally {
                connection.release();
            }
            
        } catch (error) {
            logger.error('Error conectando a base de datos:', error);
            throw error;
        }
    }

    /**
     * Obtiene una conexión del pool
     */
    async getConnection() {
        if (!this.pool) {
            throw new Error('Pool de conexiones no inicializado');
        }
        return await this.pool.getConnection();
    }

    /**
     * Crea las tablas necesarias en la base de datos
     */
    async createTables(connection = null) {
        const conn = connection || await this.getConnection();
        const shouldRelease = !connection;
        
        try {
            // Tabla para configuración del servicio
            const configTable = `
                CREATE TABLE IF NOT EXISTS ws_config (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    config_key VARCHAR(100) UNIQUE NOT NULL,
                    config_value TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `;

            // Tabla para logs de mensajes enviados
            const messagesTable = `
                CREATE TABLE IF NOT EXISTS ws_messages (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    phone_number VARCHAR(20) NOT NULL,
                    country_code VARCHAR(10) NOT NULL,
                    full_number VARCHAR(30) NOT NULL,
                    message TEXT NOT NULL,
                    channel ENUM('WHATSAPP', 'TELEGRAM', 'SMS') DEFAULT 'WHATSAPP',
                    status ENUM('sent', 'failed', 'pending') DEFAULT 'pending',
                    message_id VARCHAR(100),
                    error_message TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_phone_number (phone_number),
                    INDEX idx_full_number (full_number),
                    INDEX idx_channel (channel),
                    INDEX idx_status (status),
                    INDEX idx_created_at (created_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `;

            // Tabla para logs de conexión
            const connectionTable = `
                CREATE TABLE IF NOT EXISTS ws_connections (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    status ENUM('connected', 'disconnected', 'qr_generated', 'error') NOT NULL,
                    qr_code TEXT,
                    error_message TEXT,
                    user_info JSON,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_status (status),
                    INDEX idx_created_at (created_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `;

            // Tabla para usuarios del dashboard
            const usersTable = `
                CREATE TABLE IF NOT EXISTS ws_users (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    username VARCHAR(100) UNIQUE NOT NULL,
                    password_hash VARCHAR(255) NOT NULL,
                    email VARCHAR(255),
                    full_name VARCHAR(255),
                    is_active BOOLEAN DEFAULT TRUE,
                    last_login TIMESTAMP NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_username (username),
                    INDEX idx_is_active (is_active)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `;

            // Tabla para sesiones de WhatsApp
            const sessionsTable = `
                CREATE TABLE IF NOT EXISTS ws_sessions (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    session_id VARCHAR(100) UNIQUE NOT NULL,
                    phone_number VARCHAR(20),
                    phone_name VARCHAR(255),
                    status ENUM('active', 'inactive', 'expired') DEFAULT 'active',
                    connected_at TIMESTAMP NULL,
                    last_activity TIMESTAMP NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_session_id (session_id),
                    INDEX idx_status (status)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `;

            // Tabla para mapear usuarios de Telegram (identificadores -> chat_id)
            const telegramUsersTable = `
                CREATE TABLE IF NOT EXISTS ws_telegram_users (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    chat_id VARCHAR(50) NOT NULL,
                    username VARCHAR(255),
                    phone_number VARCHAR(50),
                    email VARCHAR(255),
                    custom_identifier VARCHAR(255),
                    first_name VARCHAR(255),
                    last_name VARCHAR(255),
                    last_message_at TIMESTAMP NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    UNIQUE KEY unique_chat_id (chat_id),
                    INDEX idx_username (username),
                    INDEX idx_phone_number (phone_number),
                    INDEX idx_email (email),
                    INDEX idx_custom_identifier (custom_identifier)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `;

            await conn.execute(configTable);
            await conn.execute(messagesTable);
            await conn.execute(connectionTable);
            await conn.execute(usersTable);
            await conn.execute(sessionsTable);
            await conn.execute(telegramUsersTable);
            
            // Verificar y agregar columna channel si no existe (para compatibilidad con instalaciones existentes)
            await this.addChannelColumnIfNotExists(conn);
            
            logger.info('Tablas de base de datos creadas/verificadas correctamente');

        } catch (error) {
            logger.error('Error creando tablas:', error);
            throw error;
        } finally {
            if (shouldRelease && conn) {
                conn.release();
            }
        }
    }

    /**
     * Verifica y agrega la columna channel si no existe
     */
    async addChannelColumnIfNotExists(connection = null) {
        const conn = connection || await this.getConnection();
        const shouldRelease = !connection;
        
        try {
            const [columns] = await conn.execute(
                "SHOW COLUMNS FROM ws_messages LIKE 'channel'"
            );
            
            if (columns.length === 0) {
                await conn.execute(
                    "ALTER TABLE ws_messages ADD COLUMN channel ENUM('WHATSAPP', 'TELEGRAM', 'SMS') DEFAULT 'WHATSAPP' AFTER message"
                );
                await conn.execute(
                    "ALTER TABLE ws_messages ADD INDEX idx_channel (channel)"
                );
                logger.info('Columna channel agregada a ws_messages');
            }
        } catch (error) {
            logger.error('Error verificando/agregando columna channel:', error);
        } finally {
            if (shouldRelease && conn) {
                conn.release();
            }
        }
    }

    /**
     * Obtiene una configuración específica
     */
    async getConfig(key) {
        try {
            const [rows] = await this.pool.execute(
                'SELECT config_value FROM ws_config WHERE config_key = ?',
                [key]
            );

            return rows.length > 0 ? rows[0].config_value : null;
        } catch (error) {
            logger.error(`Error obteniendo configuración ${key}:`, error);
            return null;
        }
    }

    /**
     * Establece una configuración específica
     */
    async setConfig(key, value) {
        try {
            await this.pool.execute(
                'INSERT INTO ws_config (config_key, config_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE config_value = ?, updated_at = CURRENT_TIMESTAMP',
                [key, value, value]
            );

            return true;
        } catch (error) {
            logger.error(`Error configurando ${key}:`, error);
            throw error;
        }
    }

    /**
     * Registra un mensaje enviado
     */
    async logMessage(messageData) {
        try {
            const { phoneNumber, countryCode, fullNumber, message, channel, status, messageId, error } = messageData;
            
            // Verificar si la columna channel existe, si no, agregarla
            try {
                await this.pool.execute(
                    'INSERT INTO ws_messages (phone_number, country_code, full_number, message, channel, status, message_id, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                    [phoneNumber, countryCode, fullNumber, message, channel || 'WHATSAPP', status, messageId || null, error || null]
                );
            } catch (insertError) {
                // Si falla por columna channel no existe, intentar sin channel
                if (insertError.message.includes('channel')) {
                    await this.pool.execute(
                        'INSERT INTO ws_messages (phone_number, country_code, full_number, message, status, message_id, error_message) VALUES (?, ?, ?, ?, ?, ?, ?)',
                        [phoneNumber, countryCode, fullNumber, message, status, messageId || null, error || null]
                    );
                } else {
                    throw insertError;
                }
            }

            logger.info(`Mensaje registrado [${channel || 'WHATSAPP'}]: ${status} - ${message.substring(0, 50)}...`);
            return true;
        } catch (error) {
            logger.error('Error registrando mensaje:', error);
            throw error;
        }
    }

    /**
     * Registra eventos de conexión
     */
    async logConnection(status, data = {}) {
        try {
            const { qrCode, errorMessage, userInfo } = data;
            
            await this.pool.execute(
                'INSERT INTO ws_connections (status, qr_code, error_message, user_info) VALUES (?, ?, ?, ?)',
                [status, qrCode || null, errorMessage || null, userInfo ? JSON.stringify(userInfo) : null]
            );

            logger.info(`Conexión registrada: ${status}`);
            return true;
        } catch (error) {
            logger.error('Error registrando conexión:', error);
            throw error;
        }
    }

    /**
     * Obtiene el historial de mensajes con filtro opcional por canal
     */
    async getMessageHistory(limit = 50, offset = 0, channel = null) {
        try {
            let query = 'SELECT * FROM ws_messages WHERE 1=1';
            const params = [];
            
            if (channel) {
                query += ' AND COALESCE(channel, \'WHATSAPP\') = ?';
                params.push(channel);
            }
            
            query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
            params.push(limit, offset);
            
            const [rows] = await this.pool.execute(query, params);
            return rows;
        } catch (error) {
            logger.error('Error obteniendo historial de mensajes:', error);
            return [];
        }
    }

    /**
     * Obtiene estadísticas de mensajes agrupadas por canal y status
     */
    async getMessageStats(channel = null) {
        try {
            let query = `
                SELECT 
                    COALESCE(channel, 'WHATSAPP') as channel,
                    status,
                    COUNT(*) as count
                FROM ws_messages 
                WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
            `;
            
            const params = [];
            if (channel) {
                query += ' AND COALESCE(channel, \'WHATSAPP\') = ?';
                params.push(channel);
            }
            
            query += ' GROUP BY COALESCE(channel, \'WHATSAPP\'), status';
            
            const [rows] = await this.pool.execute(query, params);
            return rows;
        } catch (error) {
            logger.error('Error obteniendo estadísticas:', error);
            return [];
        }
    }

    /**
     * Obtiene el estado de conexión más reciente
     */
    async getLastConnectionStatus() {
        try {
            const [rows] = await this.pool.execute(
                'SELECT * FROM ws_connections ORDER BY created_at DESC LIMIT 1'
            );

            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            logger.error('Error obteniendo último estado de conexión:', error);
            return null;
        }
    }

    /**
     * Obtiene un usuario por username
     */
    async getUserByUsername(username) {
        try {
            const [rows] = await this.pool.execute(
                'SELECT * FROM ws_users WHERE username = ? AND is_active = TRUE',
                [username]
            );

            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            logger.error('Error obteniendo usuario:', error);
            return null;
        }
    }

    /**
     * Crea un nuevo usuario
     */
    async createUser(userData) {
        try {
            const { username, passwordHash, email, fullName } = userData;
            
            await this.pool.execute(
                'INSERT INTO ws_users (username, password_hash, email, full_name) VALUES (?, ?, ?, ?)',
                [username, passwordHash, email || null, fullName || null]
            );

            logger.info(`Usuario creado: ${username}`);
            return true;
        } catch (error) {
            logger.error('Error creando usuario:', error);
            throw error;
        }
    }

    /**
     * Actualiza el último login de un usuario
     */
    async updateUserLastLogin(username) {
        try {
            await this.pool.execute(
                'UPDATE ws_users SET last_login = CURRENT_TIMESTAMP WHERE username = ?',
                [username]
            );
            return true;
        } catch (error) {
            logger.error('Error actualizando último login:', error);
            return false;
        }
    }

    /**
     * Guarda o actualiza información de sesión de WhatsApp
     */
    async saveSession(sessionData) {
        try {
            const { sessionId, phoneNumber, phoneName, status } = sessionData;
            
            await this.pool.execute(
                `INSERT INTO ws_sessions (session_id, phone_number, phone_name, status, connected_at, last_activity) 
                 VALUES (?, ?, ?, ?, NOW(), NOW())
                 ON DUPLICATE KEY UPDATE 
                 phone_number = VALUES(phone_number),
                 phone_name = VALUES(phone_name),
                 status = VALUES(status),
                 last_activity = NOW(),
                 updated_at = CURRENT_TIMESTAMP`,
                [sessionId, phoneNumber || null, phoneName || null, status || 'active']
            );

            return true;
        } catch (error) {
            logger.error('Error guardando sesión:', error);
            throw error;
        }
    }

    /**
     * Obtiene la sesión activa
     */
    async getActiveSession() {
        try {
            const [rows] = await this.pool.execute(
                'SELECT * FROM ws_sessions WHERE status = "active" ORDER BY last_activity DESC LIMIT 1'
            );

            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            logger.error('Error obteniendo sesión activa:', error);
            return null;
        }
    }

    /**
     * Limpia logs antiguos (más de 30 días)
     */
    async cleanOldLogs() {
        try {
            const [result] = await this.pool.execute(
                'DELETE FROM ws_messages WHERE created_at < DATE_SUB(NOW(), INTERVAL 30 DAY)'
            );

            const [result2] = await this.pool.execute(
                'DELETE FROM ws_connections WHERE created_at < DATE_SUB(NOW(), INTERVAL 30 DAY)'
            );

            logger.info(`Logs limpiados: ${result.affectedRows} mensajes, ${result2.affectedRows} conexiones`);
            return { messages: result.affectedRows, connections: result2.affectedRows };
        } catch (error) {
            logger.error('Error limpiando logs antiguos:', error);
            return { messages: 0, connections: 0 };
        }
    }

    /**
     * Cierra el pool de conexiones a la base de datos
     */
    async close() {
        try {
            if (this.pool) {
                await this.pool.end();
                this.pool = null;
                logger.info('Pool de conexiones a base de datos cerrado');
            }
        } catch (error) {
            logger.error('Error cerrando pool de conexiones a base de datos:', error);
        }
    }

    /**
     * Verifica la salud de la conexión
     */
    async healthCheck() {
        try {
            if (!this.pool) {
                return { healthy: false, error: 'No hay pool de conexiones activo' };
            }

            await this.pool.execute('SELECT 1');
            return { healthy: true };
        } catch (error) {
            return { healthy: false, error: error.message };
        }
    }

    /**
     * Guarda o actualiza un usuario de Telegram
     */
    async saveTelegramUser(userData) {
        try {
            const { chatId, username, phoneNumber, email, customIdentifier, firstName, lastName } = userData;
            
            await this.pool.execute(
                `INSERT INTO ws_telegram_users 
                 (chat_id, username, phone_number, email, custom_identifier, first_name, last_name, last_message_at) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
                 ON DUPLICATE KEY UPDATE 
                 username = COALESCE(?, username),
                 phone_number = COALESCE(?, phone_number),
                 email = COALESCE(?, email),
                 custom_identifier = COALESCE(?, custom_identifier),
                 first_name = COALESCE(?, first_name),
                 last_name = COALESCE(?, last_name),
                 last_message_at = NOW(),
                 updated_at = CURRENT_TIMESTAMP`,
                [
                    chatId, username, phoneNumber, email, customIdentifier, firstName, lastName,
                    username, phoneNumber, email, customIdentifier, firstName, lastName
                ]
            );

            logger.info(`Usuario de Telegram guardado/actualizado: chat_id=${chatId}, username=${username || 'N/A'}`);
            return true;
        } catch (error) {
            logger.error('Error guardando usuario de Telegram:', error);
            throw error;
        }
    }

    /**
     * Busca un chat_id de Telegram por identificador
     * @param {string} identifier - Puede ser: username (@username), phoneNumber, email, o customIdentifier
     * @returns {Promise<string|null>} chat_id o null si no se encuentra
     */
    async findTelegramChatId(identifier) {
        try {
            // Si empieza con @, es un username
            if (identifier.startsWith('@')) {
                const [rows] = await this.pool.execute(
                    'SELECT chat_id FROM ws_telegram_users WHERE username = ? LIMIT 1',
                    [identifier]
                );
                return rows.length > 0 ? rows[0].chat_id : null;
            }
            
            // Buscar por phone_number, email o custom_identifier
            const [rows] = await this.pool.execute(
                `SELECT chat_id FROM ws_telegram_users 
                 WHERE phone_number = ? OR email = ? OR custom_identifier = ? 
                 LIMIT 1`,
                [identifier, identifier, identifier]
            );
            
            return rows.length > 0 ? rows[0].chat_id : null;
        } catch (error) {
            logger.error('Error buscando chat_id de Telegram:', error);
            return null;
        }
    }

    /**
     * Obtiene todos los usuarios de Telegram registrados
     */
    async getTelegramUsers(limit = 50, offset = 0) {
        try {
            const [rows] = await this.pool.execute(
                'SELECT * FROM ws_telegram_users ORDER BY last_message_at DESC LIMIT ? OFFSET ?',
                [limit, offset]
            );
            return rows;
        } catch (error) {
            logger.error('Error obteniendo usuarios de Telegram:', error);
            return [];
        }
    }
}

module.exports = DatabaseService;
