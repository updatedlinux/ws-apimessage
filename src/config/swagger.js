/**
 * Configuración de Swagger para documentación de la API
 */

const swaggerJsdoc = require('swagger-jsdoc');

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'WhatsApp Messaging API',
            version: '2.0.0',
            description: 'API para envío de mensajes vía WhatsApp con dashboard de gestión',
            contact: {
                name: 'API Support',
            },
        },
        servers: [
            {
                url: process.env.API_BASE_URL || 'https://wsapiback.arsystech.net',
                description: 'Servidor de producción',
            },
            {
                url: 'http://localhost:3000',
                description: 'Servidor de desarrollo local',
            },
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                    description: 'Token JWT obtenido del endpoint /api/auth/login',
                },
                apiKey: {
                    type: 'apiKey',
                    in: 'header',
                    name: 'X-API-Key',
                    description: 'Clave de API para endpoints públicos (opcional)',
                },
            },
        },
        tags: [
            {
                name: 'Autenticación',
                description: 'Endpoints para autenticación y gestión de usuarios',
            },
            {
                name: 'WhatsApp',
                description: 'Endpoints para gestión de conexión WhatsApp',
            },
            {
                name: 'Mensajes',
                description: 'Endpoints para envío y gestión de mensajes',
            },
            {
                name: 'Estadísticas',
                description: 'Endpoints para estadísticas y métricas',
            },
            {
                name: 'Health',
                description: 'Endpoints de salud y estado del servicio',
            },
        ],
    },
    apis: ['./src/index.js', './src/**/*.js'], // Ruta a los archivos que contienen las anotaciones
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;

