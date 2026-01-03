/**
 * Servicio de base de datos para WhatsApp Messaging API
 * Maneja la persistencia de configuración, mensajes y usuarios
 */

const mysql = require('mysql2/promise');
const logger = require('../utils/logger');

class DatabaseService {
    constructor() {
        this.connection = null;
        this.config = {
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'whatsapp_user',
            password: process.env.DB_PASSWORD || 'your_password',
            database: process.env.DB_NAME || 'whatsapp_messaging',
            port: process.env.DB_PORT || 3306,
            charset: 'utf8mb4',
            timezone: '+00:00'
        };
    }

    /**
     * Inicializa la conexión a la base de datos
     */
    async initialize() {
        try {
            this.connection = await mysql.createConnection(this.config);
            logger.info('Conexión a base de datos establecida');

            // Crear tablas si no existen
            await this.createTables();
            
        } catch (error) {
            logger.error('Error conectando a base de datos:', error);
            throw error;
        }
    }

    /**
     * Crea las tablas necesarias en la base de datos
     */
    async createTables() {
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
                    status ENUM('sent', 'failed', 'pending') DEFAULT 'pending',
                    message_id VARCHAR(100),
                    error_message TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_phone_number (phone_number),
                    INDEX idx_full_number (full_number),
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

            await this.connection.execute(configTable);
            await this.connection.execute(messagesTable);
            await this.connection.execute(connectionTable);
            await this.connection.execute(usersTable);
            await this.connection.execute(sessionsTable);
            
            logger.info('Tablas de base de datos creadas/verificadas correctamente');

        } catch (error) {
            logger.error('Error creando tablas:', error);
            throw error;
        }
    }

    /**
     * Obtiene una configuración específica
     */
    async getConfig(key) {
        try {
            const [rows] = await this.connection.execute(
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
            await this.connection.execute(
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
            const { phoneNumber, countryCode, fullNumber, message, status, messageId, error } = messageData;
            
            await this.connection.execute(
                'INSERT INTO ws_messages (phone_number, country_code, full_number, message, status, message_id, error_message) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [phoneNumber, countryCode, fullNumber, message, status, messageId || null, error || null]
            );

            logger.info(`Mensaje registrado: ${status} - ${message.substring(0, 50)}...`);
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
            
            await this.connection.execute(
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
     * Obtiene el historial de mensajes
     */
    async getMessageHistory(limit = 50, offset = 0) {
        try {
            const [rows] = await this.connection.execute(
                'SELECT * FROM ws_messages ORDER BY created_at DESC LIMIT ? OFFSET ?',
                [limit, offset]
            );

            return rows;
        } catch (error) {
            logger.error('Error obteniendo historial de mensajes:', error);
            return [];
        }
    }

    /**
     * Obtiene estadísticas de mensajes
     */
    async getMessageStats() {
        try {
            const [rows] = await this.connection.execute(`
                SELECT 
                    status,
                    COUNT(*) as count
                FROM ws_messages 
                WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
                GROUP BY status
            `);

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
            const [rows] = await this.connection.execute(
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
            const [rows] = await this.connection.execute(
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
            
            await this.connection.execute(
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
            await this.connection.execute(
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
            
            await this.connection.execute(
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
            const [rows] = await this.connection.execute(
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
            const [result] = await this.connection.execute(
                'DELETE FROM ws_messages WHERE created_at < DATE_SUB(NOW(), INTERVAL 30 DAY)'
            );

            const [result2] = await this.connection.execute(
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
     * Cierra la conexión a la base de datos
     */
    async close() {
        try {
            if (this.connection) {
                await this.connection.end();
                this.connection = null;
                logger.info('Conexión a base de datos cerrada');
            }
        } catch (error) {
            logger.error('Error cerrando conexión a base de datos:', error);
        }
    }

    /**
     * Verifica la salud de la conexión
     */
    async healthCheck() {
        try {
            if (!this.connection) {
                return { healthy: false, error: 'No hay conexión activa' };
            }

            await this.connection.execute('SELECT 1');
            return { healthy: true };
        } catch (error) {
            return { healthy: false, error: error.message };
        }
    }
}

module.exports = DatabaseService;
