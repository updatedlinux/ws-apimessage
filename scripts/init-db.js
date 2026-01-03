/**
 * Script de inicialización de base de datos
 * Crea todas las tablas necesarias y un usuario administrador por defecto
 */

require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const readline = require('readline');

const config = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'whatsapp_user',
    password: process.env.DB_PASSWORD || 'your_password',
    database: process.env.DB_NAME || 'whatsapp_messaging',
    port: process.env.DB_PORT || 3306,
    charset: 'utf8mb4',
    timezone: '+00:00',
    multipleStatements: true
};

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

async function createDatabase() {
    let connection;
    try {
        // Conectar sin especificar base de datos para crearla
        const tempConfig = { ...config };
        delete tempConfig.database;
        
        connection = await mysql.createConnection(tempConfig);
        
        console.log('📦 Creando base de datos si no existe...');
        await connection.execute(`CREATE DATABASE IF NOT EXISTS \`${config.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
        console.log(`✅ Base de datos '${config.database}' creada/verificada`);
        
        await connection.end();
    } catch (error) {
        console.error('❌ Error creando base de datos:', error.message);
        throw error;
    }
}

async function createTables() {
    let connection;
    try {
        connection = await mysql.createConnection(config);
        console.log('📋 Creando tablas...');

        // Tabla para configuración del servicio
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS ws_config (
                id INT AUTO_INCREMENT PRIMARY KEY,
                config_key VARCHAR(100) UNIQUE NOT NULL,
                config_value TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log('✅ Tabla ws_config creada');

        // Tabla para logs de mensajes enviados
        await connection.execute(`
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
        `);
        console.log('✅ Tabla ws_messages creada');

        // Tabla para logs de conexión
        await connection.execute(`
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
        `);
        console.log('✅ Tabla ws_connections creada');

        // Tabla para usuarios del dashboard
        await connection.execute(`
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
        `);
        console.log('✅ Tabla ws_users creada');

        // Tabla para sesiones de WhatsApp
        await connection.execute(`
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
        `);
        console.log('✅ Tabla ws_sessions creada');

        await connection.end();
        console.log('✅ Todas las tablas creadas correctamente');
    } catch (error) {
        console.error('❌ Error creando tablas:', error.message);
        if (connection) {
            await connection.end();
        }
        throw error;
    }
}

async function createAdminUser() {
    let connection;
    try {
        connection = await mysql.createConnection(config);
        
        // Verificar si ya existe un usuario admin
        const [existingUsers] = await connection.execute(
            'SELECT COUNT(*) as count FROM ws_users WHERE username = ?',
            ['admin']
        );

        if (existingUsers[0].count > 0) {
            console.log('ℹ️  Usuario admin ya existe. ¿Deseas cambiar la contraseña? (s/n)');
            const changePassword = await question('> ');
            
            if (changePassword.toLowerCase() === 's') {
                const password = await question('Ingresa la nueva contraseña para admin: ');
                if (password.length < 8) {
                    console.log('❌ La contraseña debe tener al menos 8 caracteres');
                    await connection.end();
                    return;
                }
                
                const passwordHash = await bcrypt.hash(password, 10);
                await connection.execute(
                    'UPDATE ws_users SET password_hash = ? WHERE username = ?',
                    [passwordHash, 'admin']
                );
                console.log('✅ Contraseña del usuario admin actualizada');
            } else {
                console.log('ℹ️  Manteniendo contraseña actual del usuario admin');
            }
        } else {
            console.log('👤 Creando usuario administrador...');
            const password = await question('Ingresa la contraseña para el usuario admin: ');
            
            if (password.length < 8) {
                console.log('❌ La contraseña debe tener al menos 8 caracteres');
                await connection.end();
                return;
            }
            
            const passwordHash = await bcrypt.hash(password, 10);
            
            await connection.execute(
                'INSERT INTO ws_users (username, password_hash, email, full_name) VALUES (?, ?, ?, ?)',
                ['admin', passwordHash, 'admin@example.com', 'Administrador']
            );
            
            console.log('✅ Usuario admin creado correctamente');
        }

        await connection.end();
    } catch (error) {
        console.error('❌ Error creando usuario admin:', error.message);
        if (connection) {
            await connection.end();
        }
        throw error;
    }
}

async function main() {
    console.log('🚀 Iniciando configuración de base de datos...\n');
    
    try {
        // Crear base de datos
        await createDatabase();
        console.log('');
        
        // Crear tablas
        await createTables();
        console.log('');
        
        // Crear usuario admin
        await createAdminUser();
        console.log('');
        
        console.log('✅ Configuración de base de datos completada exitosamente!');
        console.log('\n📝 Próximos pasos:');
        console.log('   1. Configura las variables de entorno en el archivo .env');
        console.log('   2. Ejecuta: npm start');
        console.log('   3. Accede al dashboard en http://localhost:3003');
        console.log('   4. Inicia sesión con el usuario admin creado');
        
    } catch (error) {
        console.error('\n❌ Error durante la configuración:', error.message);
        process.exit(1);
    } finally {
        rl.close();
    }
}

// Ejecutar script
main();

