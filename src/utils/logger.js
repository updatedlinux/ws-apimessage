/**
 * Sistema de logging para el servicio de WhatsApp
 * Maneja logs estructurados con diferentes niveles
 */

const fs = require('fs').promises;
const path = require('path');

class Logger {
    constructor() {
        this.logLevel = process.env.LOG_LEVEL || 'info';
        this.logFile = process.env.LOG_FILE || './logs/whatsapp-service.log';
        this.levels = {
            error: 0,
            warn: 1,
            info: 2,
            debug: 3
        };
        
        this.ensureLogDirectory();
    }

    /**
     * Asegura que el directorio de logs existe
     */
    async ensureLogDirectory() {
        try {
            const logDir = path.dirname(this.logFile);
            await fs.mkdir(logDir, { recursive: true });
        } catch (error) {
            console.error('Error creando directorio de logs:', error);
        }
    }

    /**
     * Verifica si el nivel de log está habilitado
     */
    shouldLog(level) {
        return this.levels[level] <= this.levels[this.logLevel];
    }

    /**
     * Formatea el mensaje de log
     */
    formatMessage(level, message, meta = {}) {
        const timestamp = new Date().toISOString();
        const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
        return `[${timestamp}] ${level.toUpperCase()}: ${message}${metaStr}`;
    }

    /**
     * Escribe el log al archivo
     */
    async writeToFile(message) {
        try {
            await fs.appendFile(this.logFile, message + '\n');
        } catch (error) {
            console.error('Error escribiendo al archivo de log:', error);
        }
    }

    /**
     * Log de error
     */
    error(message, meta = {}) {
        if (this.shouldLog('error')) {
            const formattedMessage = this.formatMessage('error', message, meta);
            console.error(formattedMessage);
            this.writeToFile(formattedMessage);
        }
    }

    /**
     * Log de advertencia
     */
    warn(message, meta = {}) {
        if (this.shouldLog('warn')) {
            const formattedMessage = this.formatMessage('warn', message, meta);
            console.warn(formattedMessage);
            this.writeToFile(formattedMessage);
        }
    }

    /**
     * Log de información
     */
    info(message, meta = {}) {
        if (this.shouldLog('info')) {
            const formattedMessage = this.formatMessage('info', message, meta);
            console.log(formattedMessage);
            this.writeToFile(formattedMessage);
        }
    }

    /**
     * Log de debug
     */
    debug(message, meta = {}) {
        if (this.shouldLog('debug')) {
            const formattedMessage = this.formatMessage('debug', message, meta);
            console.log(formattedMessage);
            this.writeToFile(formattedMessage);
        }
    }

    /**
     * Log especial para WhatsApp (compatible con Baileys)
     */
    child(meta = {}) {
        return {
            level: this.logLevel,
            trace: (message, meta2 = {}) => this.debug(message, { ...meta, ...meta2 }),
            debug: (message, meta2 = {}) => this.debug(message, { ...meta, ...meta2 }),
            info: (message, meta2 = {}) => this.info(message, { ...meta, ...meta2 }),
            warn: (message, meta2 = {}) => this.warn(message, { ...meta, ...meta2 }),
            error: (message, meta2 = {}) => this.error(message, { ...meta, ...meta2 }),
            fatal: (message, meta2 = {}) => this.error(message, { ...meta, ...meta2 })
        };
    }
}

// Crear instancia singleton
const logger = new Logger();

module.exports = logger;
