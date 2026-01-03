/**
 * Script de migración para agregar la columna channel a la tabla ws_messages
 * Ejecutar con: npm run migrate-channel
 */

require('dotenv').config();
const mysql = require('mysql2/promise');

async function migrateChannel() {
    let connection = null;
    
    try {
        console.log('🔄 Iniciando migración de columna channel...\n');
        
        // Conectar a la base de datos
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'whatsapp_user',
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME || 'whatsapp_messaging',
            port: process.env.DB_PORT || 3306
        });

        console.log('✅ Conectado a la base de datos\n');

        // Verificar si la columna channel ya existe
        const [columns] = await connection.execute(
            "SHOW COLUMNS FROM ws_messages LIKE 'channel'"
        );

        if (columns.length > 0) {
            console.log('ℹ️  La columna "channel" ya existe en la tabla ws_messages');
            console.log('✅ Migración no necesaria\n');
            return;
        }

        console.log('📝 Agregando columna "channel" a la tabla ws_messages...');

        // Agregar la columna channel
        await connection.execute(`
            ALTER TABLE ws_messages 
            ADD COLUMN channel ENUM('WHATSAPP', 'TELEGRAM', 'SMS') DEFAULT 'WHATSAPP' 
            AFTER message
        `);

        console.log('✅ Columna "channel" agregada correctamente');

        // Agregar índice para mejorar las consultas
        console.log('📝 Agregando índice para la columna "channel"...');
        await connection.execute(`
            ALTER TABLE ws_messages 
            ADD INDEX idx_channel (channel)
        `);

        console.log('✅ Índice agregado correctamente');

        // Actualizar registros existentes que no tengan channel
        console.log('📝 Actualizando registros existentes sin canal...');
        const [updateResult] = await connection.execute(`
            UPDATE ws_messages 
            SET channel = 'WHATSAPP' 
            WHERE channel IS NULL
        `);

        console.log(`✅ ${updateResult.affectedRows} registros actualizados`);

        console.log('\n✅ Migración completada exitosamente!');
        console.log('\n📊 Resumen:');
        console.log('   - Columna "channel" agregada');
        console.log('   - Índice creado para optimizar consultas');
        console.log('   - Registros existentes actualizados a WHATSAPP\n');

    } catch (error) {
        console.error('\n❌ Error durante la migración:', error.message);
        if (error.code === 'ER_DUP_FIELDNAME') {
            console.log('ℹ️  La columna ya existe, no es necesario migrar');
        } else {
            console.error('Detalles del error:', error);
            process.exit(1);
        }
    } finally {
        if (connection) {
            await connection.end();
            console.log('🔌 Conexión a la base de datos cerrada');
        }
    }
}

// Ejecutar migración
migrateChannel()
    .then(() => {
        console.log('✨ Proceso finalizado');
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ Error fatal:', error);
        process.exit(1);
    });

