/**
 * Script para cambiar la contraseña del usuario admin
 * Uso: node scripts/reset-admin-password.js
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
    timezone: '+00:00'
};

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

async function resetAdminPassword() {
    let connection;
    try {
        console.log('🔐 Cambio de contraseña del usuario admin\n');
        
        // Conectar a la base de datos
        connection = await mysql.createConnection(config);
        console.log('✅ Conectado a la base de datos\n');
        
        // Verificar si existe el usuario admin
        const [users] = await connection.execute(
            'SELECT id, username, email, full_name FROM ws_users WHERE username = ?',
            ['admin']
        );
        
        if (users.length === 0) {
            console.log('❌ El usuario admin no existe en la base de datos.');
            console.log('   Ejecuta primero: npm run init-db\n');
            await connection.end();
            rl.close();
            process.exit(1);
        }
        
        const adminUser = users[0];
        console.log(`👤 Usuario encontrado:`);
        console.log(`   - Username: ${adminUser.username}`);
        console.log(`   - Email: ${adminUser.email || 'N/A'}`);
        console.log(`   - Nombre: ${adminUser.full_name || 'N/A'}\n`);
        
        // Solicitar nueva contraseña
        const newPassword = await question('Ingresa la nueva contraseña para admin: ');
        
        if (!newPassword || newPassword.trim().length === 0) {
            console.log('❌ La contraseña no puede estar vacía');
            await connection.end();
            rl.close();
            process.exit(1);
        }
        
        if (newPassword.length < 8) {
            console.log('❌ La contraseña debe tener al menos 8 caracteres');
            await connection.end();
            rl.close();
            process.exit(1);
        }
        
        // Confirmar contraseña
        const confirmPassword = await question('Confirma la nueva contraseña: ');
        
        if (newPassword !== confirmPassword) {
            console.log('❌ Las contraseñas no coinciden');
            await connection.end();
            rl.close();
            process.exit(1);
        }
        
        // Hashear la nueva contraseña
        console.log('\n🔒 Generando hash de la contraseña...');
        const passwordHash = await bcrypt.hash(newPassword, 10);
        
        // Actualizar contraseña en la base de datos
        await connection.execute(
            'UPDATE ws_users SET password_hash = ?, updated_at = NOW() WHERE username = ?',
            [passwordHash, 'admin']
        );
        
        console.log('✅ Contraseña del usuario admin actualizada correctamente\n');
        console.log('📝 Puedes iniciar sesión en el dashboard con:');
        console.log(`   - Username: admin`);
        console.log(`   - Password: ${newPassword}\n`);
        
        await connection.end();
        
    } catch (error) {
        console.error('❌ Error cambiando la contraseña:', error.message);
        if (connection) {
            await connection.end();
        }
        rl.close();
        process.exit(1);
    } finally {
        rl.close();
    }
}

// Ejecutar script
resetAdminPassword();


