/**
 * Script para generar API Key y JWT Secret seguros
 * Genera valores aleatorios y seguros para usar en el archivo .env
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

function generateAPIKey() {
    // Genera una API key más legible pero segura
    const prefix = 'wa_api_';
    const randomPart = crypto.randomBytes(32).toString('hex');
    return `${prefix}${randomPart}`;
}

function generateJWTSecret() {
    // JWT secret debe ser largo y aleatorio
    return crypto.randomBytes(64).toString('hex');
}

function updateEnvFile(envPath, apiKey, jwtSecret) {
    try {
        let envContent = fs.readFileSync(envPath, 'utf8');
        
        // Reemplazar o agregar API_SECRET_KEY
        if (envContent.includes('API_SECRET_KEY=')) {
            envContent = envContent.replace(
                /API_SECRET_KEY=.*/,
                `API_SECRET_KEY=${apiKey}`
            );
        } else {
            envContent += `\nAPI_SECRET_KEY=${apiKey}\n`;
        }
        
        // Reemplazar o agregar JWT_SECRET
        if (envContent.includes('JWT_SECRET=')) {
            envContent = envContent.replace(
                /JWT_SECRET=.*/,
                `JWT_SECRET=${jwtSecret}`
            );
        } else {
            envContent += `JWT_SECRET=${jwtSecret}\n`;
        }
        
        fs.writeFileSync(envPath, envContent, 'utf8');
        return true;
    } catch (error) {
        console.error('❌ Error actualizando .env:', error.message);
        return false;
    }
}

function createEnvFromExample(envExamplePath, envPath, apiKey, jwtSecret) {
    try {
        let envContent = fs.readFileSync(envExamplePath, 'utf8');
        
        // Reemplazar los valores
        envContent = envContent.replace(
            /API_SECRET_KEY=.*/,
            `API_SECRET_KEY=${apiKey}`
        );
        envContent = envContent.replace(
            /JWT_SECRET=.*/,
            `JWT_SECRET=${jwtSecret}`
        );
        
        fs.writeFileSync(envPath, envContent, 'utf8');
        return true;
    } catch (error) {
        console.error('❌ Error creando .env:', error.message);
        return false;
    }
}

async function askQuestion(rl, question) {
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            resolve(answer.trim().toLowerCase());
        });
    });
}

async function main() {
    console.log('🔐 Generando claves seguras...\n');

    const apiKey = generateAPIKey();
    const jwtSecret = generateJWTSecret();

    console.log('✅ Claves generadas exitosamente:\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('API_SECRET_KEY=' + apiKey);
    console.log('JWT_SECRET=' + jwtSecret);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const envPath = path.join(__dirname, '..', '.env');
    const envExamplePath = path.join(__dirname, '..', 'env.example');

    if (fs.existsSync(envPath)) {
        console.log('📝 Archivo .env encontrado.\n');
        
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        const answer = await askQuestion(rl, '¿Deseas actualizar el archivo .env automáticamente? (s/n): ');
        rl.close();

        if (answer === 's' || answer === 'si' || answer === 'y' || answer === 'yes') {
            if (updateEnvFile(envPath, apiKey, jwtSecret)) {
                console.log('\n✅ Archivo .env actualizado correctamente!\n');
            } else {
                console.log('\n❌ No se pudo actualizar el archivo .env');
                console.log('💡 Copia las claves manualmente desde arriba\n');
            }
        } else {
            console.log('\n💡 Copia las claves anteriores y pégalas en tu archivo .env');
            console.log('   Reemplaza los valores de API_SECRET_KEY y JWT_SECRET\n');
        }
    } else {
        console.log('📄 Archivo .env no encontrado.\n');
        
        if (fs.existsSync(envExamplePath)) {
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });

            const answer = await askQuestion(rl, '¿Deseas crear .env desde env.example con las claves generadas? (s/n): ');
            rl.close();

            if (answer === 's' || answer === 'si' || answer === 'y' || answer === 'yes') {
                if (createEnvFromExample(envExamplePath, envPath, apiKey, jwtSecret)) {
                    console.log('\n✅ Archivo .env creado con las claves generadas!\n');
                    console.log('⚠️  IMPORTANTE: Revisa y completa los demás valores en .env');
                    console.log('   (Base de datos, puerto, etc.)\n');
                } else {
                    console.log('\n❌ No se pudo crear el archivo .env');
                    console.log('💡 Copia las claves manualmente desde arriba\n');
                }
            } else {
                console.log('\n💡 Copia las claves anteriores y pégalas en tu archivo .env\n');
            }
        } else {
            console.log('❌ No se encontró env.example');
            console.log('💡 Copia las claves anteriores y pégalas en tu archivo .env\n');
        }
    }

    console.log('🔒 Estas claves son seguras y únicas. Guárdalas de forma segura.');
    console.log('   No las compartas ni las subas a repositorios públicos.\n');
}

// Ejecutar
main().catch(error => {
    console.error('❌ Error:', error.message);
    process.exit(1);
});

