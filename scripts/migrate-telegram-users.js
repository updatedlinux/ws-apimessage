/**
 * Script de migración para crear la tabla ws_telegram_users
 * Ejecutar con: npm run migrate-telegram-users
 */

require('dotenv').config();
const mysql = require('mysql2/promise');

async function migrateTelegramUsers() {
    let connection = null;
    
    try {
        console.log('🔄 Iniciando migración de tabla ws_telegram_users...\n');
        
        // Conectar a la base de datos
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'whatsapp_user',
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME || 'whatsapp_messaging',
            port: process.env.DB_PORT || 3306
        });

        console.log('✅ Conectado a la base de datos\n');

        // Verificar si la tabla ya existe
        const [tables] = await connection.execute(
            "SHOW TABLES LIKE 'ws_telegram_users'"
        );

        if (tables.length > 0) {
            console.log('ℹ️  La tabla "ws_telegram_users" ya existe');
            console.log('✅ Migración no necesaria\n');
            return;
        }

        console.log('📝 Creando tabla "ws_telegram_users"...');

        // Crear la tabla
        await connection.execute(`
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
        `);

        console.log('✅ Tabla "ws_telegram_users" creada correctamente');
        console.log('\n📊 Resumen:');
        console.log('   - Tabla ws_telegram_users creada');
        console.log('   - Índices creados para optimizar búsquedas');
        console.log('   - Lista para registrar usuarios de Telegram\n');

    } catch (error) {
        console.error('\n❌ Error durante la migración:', error.message);
        console.error('Detalles del error:', error);
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
            console.log('🔌 Conexión a la base de datos cerrada');
        }
    }
}

// Ejecutar migración
migrateTelegramUsers()
    .then(() => {
        console.log('✨ Proceso finalizado');
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ Error fatal:', error);
        process.exit(1);
    });


