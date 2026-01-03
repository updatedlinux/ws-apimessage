<?php
/**
 * Plugin Name: Condo360 WhatsApp Service (Debug)
 * Plugin URI: https://bonaventurecclub.com
 * Description: Plugin para conectar WhatsApp con el servicio Condo360 usando QR y gestionar grupos - VERSIÓN DEBUG.
 * Version: 1.0.0-debug
 * Author: Condo360
 * Author URI: https://bonaventurecclub.com
 * License: GPL v2 or later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: condo360ws
 * Domain Path: /languages
 * Requires at least: 5.0
 * Tested up to: 6.4
 * Requires PHP: 7.4
 * Network: false
 */

// Prevenir acceso directo
if (!defined('ABSPATH')) {
    exit;
}

/**
 * Clase principal del plugin Condo360 WhatsApp
 */
class Condo360WhatsAppPlugin {
    
    private $api_url;
    private $api_secret;
    
    /**
     * Constructor del plugin
     */
    public function __construct() {
        // Configurar zona horaria de Venezuela
        date_default_timezone_set('America/Caracas');
        
        // Configuración básica
        $this->api_url = 'https://wschat.bonaventurecclub.com';
        $this->api_secret = 'condo360_whatsapp_secret_2025';
        
        // Hooks de WordPress
        add_action('init', array($this, 'init'));
        add_action('wp_enqueue_scripts', array($this, 'enqueue_scripts'));
        add_action('wp_ajax_condo360ws_get_groups', array($this, 'ajax_get_groups'));
        // Removed: wp_ajax_condo360ws_set_group_db - ahora usamos API Node.js directamente
        add_action('wp_ajax_condo360ws_disconnect', array($this, 'ajax_disconnect'));
        
        // Shortcode principal
        add_shortcode('wa_connect_qr', array($this, 'shortcode_wa_connect_qr'));
        
        // Activar/desactivar plugin
        register_activation_hook(__FILE__, array($this, 'activate'));
        register_deactivation_hook(__FILE__, array($this, 'deactivate'));
    }
    
    /**
     * Inicialización del plugin
     */
    public function init() {
        // Crear tablas si no existen
        $this->create_tables();
    }
    
    /**
     * Cargar scripts y estilos
     */
    public function enqueue_scripts() {
        // Solo cargar jQuery y CSS básico
        wp_enqueue_script('jquery');
        wp_enqueue_style(
            'condo360ws-style',
            plugin_dir_url(__FILE__) . 'assets/style.css',
            array(),
            '1.0.0-debug'
        );
        
        // Variables para JavaScript (incluyendo ajaxurl para frontend)
        wp_localize_script('jquery', 'condo360ws_ajax', array(
            'ajax_url' => admin_url('admin-ajax.php'),
            'nonce' => wp_create_nonce('condo360ws_nonce'),
            'api_url' => $this->api_url
        ));
    }
    
    /**
     * Crear tablas de base de datos
     */
    private function create_tables() {
        global $wpdb;
        
        $charset_collate = $wpdb->get_charset_collate();
        
        // Tabla de configuración
        $config_table = $wpdb->prefix . 'condo360ws_config';
        $config_sql = "CREATE TABLE IF NOT EXISTS $config_table (
            id int(11) NOT NULL AUTO_INCREMENT,
            config_key varchar(100) NOT NULL,
            config_value text,
            created_at timestamp DEFAULT CURRENT_TIMESTAMP,
            updated_at timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY config_key (config_key)
        ) $charset_collate;";
        
        require_once(ABSPATH . 'wp-admin/includes/upgrade.php');
        dbDelta($config_sql);
    }
    
    /**
     * Shortcode para mostrar QR de conexión
     */
    public function shortcode_wa_connect_qr($atts) {
        // Solo mostrar a administradores
        if (!current_user_can('administrator')) {
            return '<div class="condo360ws-error">Solo administradores pueden ver este contenido</div>';
        }
        
        // Obtener estado del API
        $api_status = $this->get_api_status();
        
        ob_start();
        ?>
        <div class="condo360ws-container">
            <div class="condo360ws-header">
                <h3>Conexion Whatsapp Condominio360</h3>
                <div class="condo360ws-status-indicator" id="condo360ws-status">
                    <span class="status-dot <?php echo $api_status['connected'] ? 'connected' : 'disconnected'; ?>"></span>
                    <span class="status-text">
                        <?php echo $api_status['connected'] ? 'WhatsApp Conectado' : 'WhatsApp Desconectado'; ?>
                    </span>
                </div>
            </div>
            
            <div class="condo360ws-content">
                <?php if ($api_status['connected']): ?>
                    <div class="condo360ws-connected">
                        <div class="success-icon">✓</div>
                        <h4>WhatsApp Conectado</h4>
                        <p>El servicio de WhatsApp está funcionando correctamente.</p>
                        
                        <div id="groups-section" style="margin-top: 20px;">
                            <h5>Gestión de Grupos</h5>
                            <button type="button" id="load-groups-btn" class="btn-primary">
                                Cargar Grupos
                            </button>
                            <div id="groups-loading" class="loading-spinner" style="display: none;">
                                <div class="spinner"></div>
                                <p>Cargando grupos...</p>
                            </div>
                            <div id="groups-list" style="display: none;">
                                <!-- Los grupos se cargarán aquí -->
                            </div>
                            <div id="selected-group" class="selected-group" style="display: none;">
                                <h6>Grupo Seleccionado:</h6>
                                <div id="selected-group-info"></div>
                                <button type="button" id="set-group-btn" class="btn-success">
                                    Configurar como Grupo de Destino
                                </button>
                            </div>
                        </div>
                        
                        <div style="margin-top: 20px;">
                            <button type="button" id="disconnect-btn" class="btn-danger">
                                Desconectar WhatsApp
                            </button>
                        </div>
                    </div>
                <?php elseif ($api_status['qrGenerated']): ?>
                    <div class="condo360ws-qr">
                        <h4>Conectar WhatsApp</h4>
                        <p>Escanea este código QR con WhatsApp para conectar:</p>
                        <?php 
                        $qr_data = $this->get_qr_direct();
                        if ($qr_data): 
                        ?>
                            <div class="qr-code-wrapper">
                                <img src="data:image/png;base64,<?php echo esc_attr($qr_data); ?>" alt="Código QR de WhatsApp" />
                            </div>
                            <div class="qr-instructions">
                                <p><strong>Instrucciones:</strong></p>
                                <ol>
                                    <li>Abre WhatsApp en tu teléfono</li>
                                    <li>Ve a Configuración > Dispositivos vinculados</li>
                                    <li>Toca "Vincular un dispositivo"</li>
                                    <li>Escanea este código QR</li>
                                </ol>
                            </div>
                        <?php else: ?>
                            <p class="error-message">Error obteniendo código QR</p>
                        <?php endif; ?>
                    </div>
                <?php else: ?>
                    <div class="condo360ws-waiting">
                        <div class="waiting-icon">⏳</div>
                        <h4>Iniciando WhatsApp</h4>
                        <p>Esperando conexión...</p>
                    </div>
                <?php endif; ?>
            </div>
            
            <div class="condo360ws-footer">
                <button type="button" onclick="location.reload();" class="btn-secondary">
                    Actualizar Estado
                </button>
                <div class="last-updated">
                    Última actualización: <?php echo date('H:i:s'); ?>
                    <?php if ($api_status['connected']): ?>
                        <br><small style="color: #28a745;">✓ Actualización automática deshabilitada (conectado)</small>
                    <?php else: ?>
                        <br><small style="color: #dc3545;">🔄 Actualización automática cada 10s (desconectado)</small>
                    <?php endif; ?>
                </div>
            </div>
        </div>
        
        <script>
        jQuery(document).ready(function($) {
            var updateInterval;
            var isConnected = <?php echo $api_status['connected'] ? 'true' : 'false'; ?>;
            var isQRGenerated = <?php echo $api_status['qrGenerated'] ? 'true' : 'false'; ?>;
            var qrLoaded = false; // Control para evitar recargar QR
            
            // Función para verificar estado del API (optimizada para evitar rate limits)
            function checkAPIStatus() {
                // Solo verificar si NO está conectado y NO hay QR cargado
                if (isConnected || qrLoaded) {
                    return;
                }
                
                $.ajax({
                    url: condo360ws_ajax.api_url + '/api/status',
                    type: 'GET',
                    timeout: 10000,
                    success: function(response) {
                        if (response.success) {
                            var newConnected = response.data.connected;
                            var newQRGenerated = response.data.qrGenerated;
                            
                            // Si cambió el estado de conexión
                            if (newConnected !== isConnected) {
                                isConnected = newConnected;
                                qrLoaded = false; // Resetear QR cuando cambia conexión
                                updateUI();
                                
                                if (isConnected) {
                                    // Conectó - cargar grupos automáticamente
                                    setTimeout(loadGroups, 1000);
                                }
                            }
                            
                            // Si cambió el estado del QR
                            if (newQRGenerated !== isQRGenerated) {
                                isQRGenerated = newQRGenerated;
                                updateUI();
                            }
                            
                            // Actualizar timestamp y indicador según estado
                            if (isConnected) {
                                $('.last-updated').html('Última actualización: ' + new Date().toLocaleTimeString() + 
                                    '<br><small style="color: #28a745;">✓ Actualización automática deshabilitada (conectado)</small>');
                            } else {
                                $('.last-updated').html('Última actualización: ' + new Date().toLocaleTimeString() + 
                                    '<br><small style="color: #dc3545;">🔄 Actualización automática cada 10s (desconectado)</small>');
                            }
                        }
                    },
                    error: function(xhr) {
                        // Rate limiting deshabilitado - solo log de errores generales
                        if (xhr.status >= 500) {
                            console.error('Error del servidor:', xhr.status);
                        }
                    }
                });
            }
            
            // Función para actualizar la UI según el estado
            function updateUI() {
                if (isConnected) {
                    // Verificar grupo configurado
                    $.ajax({
                        url: condo360ws_ajax.api_url + '/api/configured-group',
                        type: 'GET',
                        timeout: 5000,
                        success: function(response) {
                            var groupStatus = '';
                            if (response.success && response.data && response.data.groupId) {
                                groupStatus = '<div style="margin-top: 10px; padding: 10px; background: #d4edda; border: 1px solid #c3e6cb; border-radius: 4px; color: #155724;">' +
                                    '<strong>✅ Grupo configurado:</strong> Ya hay un grupo configurado para el envío de mensajes.' +
                                    '</div>';
                            } else {
                                groupStatus = '<div style="margin-top: 10px; padding: 10px; background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 4px; color: #721c24;">' +
                                    '<strong>⚠️ Sin grupo configurado:</strong> No hay ningún grupo configurado para el envío de mensajes.' +
                                    '</div>';
                            }
                            
                            // Mostrar estado conectado con información del grupo
                            $('.status-dot').removeClass('disconnected').addClass('connected');
                            $('.status-text').text('WhatsApp Conectado');
                            $('.condo360ws-content').html(`
                                <div class="condo360ws-connected">
                                    <div class="success-icon">✓</div>
                                    <h4>WhatsApp Conectado</h4>
                                    <p>El servicio de WhatsApp está funcionando correctamente.</p>
                                    ${groupStatus}
                                    
                                    <div id="groups-section" style="margin-top: 20px;">
                                        <h5>Gestión de Grupos</h5>
                                        <button type="button" id="load-groups-btn" class="btn-primary">
                                            Cargar Grupos
                                        </button>
                                        <div id="groups-loading" class="loading-spinner" style="display: none;">
                                            <div class="spinner"></div>
                                            <p>Cargando grupos...</p>
                                        </div>
                                        <div id="groups-list" style="display: none;">
                                            <!-- Los grupos se cargarán aquí -->
                                        </div>
                                        <div id="selected-group" class="selected-group" style="display: none;">
                                            <h6>Grupo Seleccionado:</h6>
                                            <div id="selected-group-info"></div>
                                            <button type="button" id="set-group-btn" class="btn-success">
                                                Configurar como Grupo de Destino
                                            </button>
                                        </div>
                                    </div>
                                    
                                    <div style="margin-top: 20px;">
                                        <button type="button" id="disconnect-btn" class="btn-danger">
                                            Desconectar WhatsApp
                                        </button>
                                    </div>
                                </div>
                            `);
                            
                            // Reconfigurar eventos
                            setupEventHandlers();
                            
                            // Actualizar indicador de estado
                            $('.last-updated').html('Última actualización: ' + new Date().toLocaleTimeString() + 
                                '<br><small style="color: #28a745;">✓ Actualización automática deshabilitada (conectado)</small>');
                        },
                        error: function() {
                            // En caso de error, mostrar sin información del grupo
                            var groupStatus = '<div style="margin-top: 10px; padding: 10px; background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 4px; color: #856404;">' +
                                '<strong>⚠️ Estado desconocido:</strong> No se pudo verificar el estado del grupo configurado.' +
                                '</div>';
                            
                            $('.status-dot').removeClass('disconnected').addClass('connected');
                            $('.status-text').text('WhatsApp Conectado');
                            $('.condo360ws-content').html(`
                                <div class="condo360ws-connected">
                                    <div class="success-icon">✓</div>
                                    <h4>WhatsApp Conectado</h4>
                                    <p>El servicio de WhatsApp está funcionando correctamente.</p>
                                    ${groupStatus}
                                    
                                    <div id="groups-section" style="margin-top: 20px;">
                                        <h5>Gestión de Grupos</h5>
                                        <button type="button" id="load-groups-btn" class="btn-primary">
                                            Cargar Grupos
                                        </button>
                                        <div id="groups-loading" class="loading-spinner" style="display: none;">
                                            <div class="spinner"></div>
                                            <p>Cargando grupos...</p>
                                        </div>
                                        <div id="groups-list" style="display: none;">
                                            <!-- Los grupos se cargarán aquí -->
                                        </div>
                                        <div id="selected-group" class="selected-group" style="display: none;">
                                            <h6>Grupo Seleccionado:</h6>
                                            <div id="selected-group-info"></div>
                                            <button type="button" id="set-group-btn" class="btn-success">
                                                Configurar como Grupo de Destino
                                            </button>
                                        </div>
                                    </div>
                                    
                                    <div style="margin-top: 20px;">
                                        <button type="button" id="disconnect-btn" class="btn-danger">
                                            Desconectar WhatsApp
                                        </button>
                                    </div>
                                </div>
                            `);
                            
                            // Reconfigurar eventos
                            setupEventHandlers();
                            
                            // Actualizar indicador de estado
                            $('.last-updated').html('Última actualización: ' + new Date().toLocaleTimeString() + 
                                '<br><small style="color: #28a745;">✓ Actualización automática deshabilitada (conectado)</small>');
                        }
                    });
                    
                } else if (isQRGenerated) {
                    // Mostrar QR
                    loadQRCode();
                } else {
                    // Mostrar estado de espera
                    $('.status-dot').removeClass('connected').addClass('disconnected');
                    $('.status-text').text('WhatsApp Desconectado');
                    $('.condo360ws-content').html(`
                        <div class="condo360ws-waiting">
                            <div class="waiting-icon">⏳</div>
                            <h4>Iniciando WhatsApp</h4>
                            <p>Esperando conexión...</p>
                        </div>
                    `);
                }
            }
            
            // Función para cargar el código QR
            function loadQRCode() {
                $('.status-dot').removeClass('connected').addClass('disconnected');
                $('.status-text').text('WhatsApp Desconectado');
                
                // Solo cargar QR si no está ya mostrado
                if (!qrLoaded) {
                    $.ajax({
                        url: condo360ws_ajax.api_url + '/api/qr',
                        type: 'GET',
                        timeout: 10000,
                        success: function(response) {
                            if (response.success && response.qr) {
                                qrLoaded = true; // Marcar como cargado
                                $('.condo360ws-content').html(`
                                    <div class="condo360ws-qr">
                                        <h4>Conectar WhatsApp</h4>
                                        <p>Escanea este código QR con WhatsApp para conectar:</p>
                                        <div class="qr-code-wrapper">
                                            <img src="data:image/png;base64,${response.qr}" alt="Código QR de WhatsApp" />
                                        </div>
                                        <div class="qr-instructions">
                                            <p><strong>Instrucciones:</strong></p>
                                            <ol>
                                                <li>Abre WhatsApp en tu teléfono</li>
                                                <li>Ve a Configuración > Dispositivos vinculados</li>
                                                <li>Toca "Vincular un dispositivo"</li>
                                                <li>Escanea este código QR</li>
                                            </ol>
                                        </div>
                                    </div>
                                `);
                            } else {
                                $('.condo360ws-content').html(`
                                    <div class="condo360ws-waiting">
                                        <div class="waiting-icon">⏳</div>
                                        <h4>Generando QR</h4>
                                        <p>Esperando código QR...</p>
                                    </div>
                                `);
                            }
                        },
                        error: function() {
                            $('.condo360ws-content').html(`
                                <div class="condo360ws-waiting">
                                    <div class="waiting-icon">⏳</div>
                                    <h4>Generando QR</h4>
                                    <p>Esperando código QR...</p>
                                </div>
                            `);
                        }
                    });
                }
            }
            
            // Función para cargar grupos
            function loadGroups() {
                $('#load-groups-btn').prop('disabled', true).text('Cargando...');
                $('#groups-loading').show();
                $('#groups-list').hide();
                
                $.ajax({
                    url: condo360ws_ajax.ajax_url,
                    type: 'POST',
                    data: {
                        action: 'condo360ws_get_groups',
                        nonce: condo360ws_ajax.nonce
                    },
                    success: function(response) {
                        $('#groups-loading').hide();
                        
                        if (response.success && response.data.groups) {
                            displayGroups(response.data.groups);
                        } else {
                            var errorMsg = 'Error desconocido';
                            if (response.data) {
                                if (typeof response.data === 'string') {
                                    errorMsg = response.data;
                                } else if (response.data.message) {
                                    errorMsg = response.data.message;
                                } else if (response.data.error) {
                                    errorMsg = response.data.error;
                                }
                            }
                            $('#groups-list').html('<p style="color: red;">Error cargando grupos: ' + errorMsg + '</p>').show();
                        }
                    },
                    error: function(xhr, status, error) {
                        $('#groups-loading').hide();
                        $('#groups-list').html('<p style="color: red;">Error AJAX: ' + error + '</p>').show();
                    },
                    complete: function() {
                        $('#load-groups-btn').prop('disabled', false).text('Cargar Grupos');
                    }
                });
            }
            
            // Función para mostrar grupos
            function displayGroups(groups) {
                var html = '<div style="max-height: 400px; overflow-y: auto; border: 1px solid #ddd; border-radius: 4px;">';
                
                if (groups.length === 0) {
                    html += '<p style="padding: 20px; text-align: center; color: #666;">No se encontraron grupos.</p>';
                } else {
                    html += '<p style="padding: 15px; margin: 0; background: #f8f9fa; border-bottom: 1px solid #ddd;">Selecciona un grupo para enviar mensajes:</p>';
                    
                    groups.forEach(function(group) {
                        var isBroadcast = group.id.includes('@broadcast');
                        var typeLabel = isBroadcast ? '📢 CANAL DE AVISOS' : '👥 GRUPO';
                        var typeColor = isBroadcast ? '#e74c3c' : '#3498db';
                        
                        html += '<div class="group-item" data-group-id="' + group.id + '" style="padding: 12px 15px; border-bottom: 1px solid #f0f0f0; cursor: pointer; transition: background 0.3s;" onmouseover="this.style.background=\'#f9f9f9\'" onmouseout="this.style.background=\'#fff\'">';
                        html += '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">';
                        html += '<div style="font-weight: bold; color: #333;">' + group.subject + '</div>';
                        html += '<div style="font-size: 10px; color: ' + typeColor + '; background: ' + typeColor + '20; padding: 2px 6px; border-radius: 10px; font-weight: bold;">' + typeLabel + '</div>';
                        html += '</div>';
                        html += '<div style="font-size: 12px; color: #666; font-family: monospace; background: #f5f5f5; padding: 4px 8px; border-radius: 3px; margin-bottom: 5px;">ID: ' + group.id + '</div>';
                        html += '<div style="font-size: 12px; color: #666;">' + group.participants + ' participantes</div>';
                        if (group.description && group.description.length > 0) {
                            html += '<div style="font-size: 11px; color: #888; margin-top: 5px; max-height: 40px; overflow: hidden;">' + group.description.substring(0, 100) + (group.description.length > 100 ? '...' : '') + '</div>';
                        }
                        html += '</div>';
                    });
                }
                
                html += '</div>';
                
                $('#groups-list').html(html).show();
                
                // Agregar evento click a los grupos
                $('.group-item').on('click', function() {
                    // Remover selección anterior
                    $('.group-item').css('background', '#fff');
                    
                    // Seleccionar grupo actual
                    $(this).css('background', '#e3f2fd');
                    
                    var groupId = $(this).data('group-id');
                    var groupName = $(this).find('div:first div:first').text(); // Obtener solo el nombre del grupo
                    
                    // Debug logging
                    console.log('Condo360 Debug: Grupo seleccionado - ID:', groupId, 'Nombre:', groupName);
                    
                    // Mostrar información del grupo seleccionado
                    $('#selected-group-info').html(
                        '<div style="font-weight: bold; color: #333; margin-bottom: 5px;">' + groupName + '</div>' +
                        '<div style="font-size: 12px; color: #666; font-family: monospace; background: #e9ecef; padding: 4px 8px; border-radius: 3px;">ID: ' + groupId + '</div>'
                    );
                    $('#selected-group').show();
                });
            }
            
            // Función para configurar grupo
            function setGroup() {
                // Extraer datos de manera más robusta
                var groupIdElement = $('#selected-group-info').find('div:last');
                var groupNameElement = $('#selected-group-info').find('div:first');
                
                var groupId = groupIdElement.text().replace('ID: ', '').trim();
                var groupName = groupNameElement.text().trim();
                
                // Debug logging
                console.log('Condo360 Debug: groupId extraído:', groupId);
                console.log('Condo360 Debug: groupName extraído:', groupName);
                console.log('Condo360 Debug: HTML del selected-group-info:', $('#selected-group-info').html());
                console.log('Condo360 Debug: Elemento groupId:', groupIdElement);
                console.log('Condo360 Debug: Elemento groupName:', groupNameElement);
                
                if (!groupId || groupId === '') {
                    alert('No hay grupo seleccionado o el ID está vacío');
                    console.error('Condo360 Debug: groupId está vacío o indefinido');
                    return;
                }
                
                $('#set-group-btn').prop('disabled', true).text('Configurando...');
                
                $.ajax({
                    url: condo360ws_ajax.api_url + '/api/set-group',
                    type: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    data: JSON.stringify({
                        groupId: groupId,
                        groupName: groupName,
                        secretKey: 'condo360_whatsapp_secret_2025'
                    }),
                    beforeSend: function() {
                        console.log('Condo360 Debug: Enviando datos al API Node.js:', {
                            groupId: groupId,
                            groupName: groupName,
                            secretKey: 'condo360_whatsapp_secret_2025'
                        });
                    },
                    success: function(response) {
                        console.log('Condo360 Debug: Respuesta del API Node.js:', response);
                        if (response.success) {
                            alert('✅ Grupo "' + groupName + '" configurado correctamente como destino.\n\nID: ' + groupId + '\n\nEl grupo ya está listo para recibir mensajes.');
                            // Actualizar UI para mostrar el grupo configurado
                            updateUI();
                        } else {
                            console.error('Condo360 Debug: Error en respuesta:', response);
                            alert('❌ Error configurando grupo: ' + (response.error || 'Error desconocido'));
                        }
                    },
                    error: function(xhr, status, error) {
                        console.error('Condo360 Debug: Error AJAX:', {xhr: xhr, status: status, error: error});
                        alert('Error AJAX configurando grupo: ' + error);
                    },
                    complete: function() {
                        $('#set-group-btn').prop('disabled', false).text('Configurar como Grupo de Destino');
                    }
                });
            }
            
            // Función para desconectar WhatsApp
            function disconnectWhatsApp() {
                if (!confirm('¿Estás seguro de que quieres desconectar WhatsApp?')) {
                    return;
                }
                
                $('#disconnect-btn').prop('disabled', true).text('Desconectando...');
                
                $.ajax({
                    url: condo360ws_ajax.ajax_url,
                    type: 'POST',
                    data: {
                        action: 'condo360ws_disconnect',
                        nonce: condo360ws_ajax.nonce
                    },
                    success: function(response) {
                        if (response.success) {
                            alert('✅ WhatsApp desconectado correctamente.\n\nSe generará un nuevo QR y se limpió la configuración del grupo.\n\nDeberás seleccionar el grupo nuevamente después de reconectar.');
                            // Reactivar verificación automática después de desconectar
                            qrLoaded = false;
                            clearInterval(updateInterval);
                            updateInterval = setInterval(checkAPIStatus, 10000);
                            
                            // Mostrar tooltip informativo
                            showDisconnectTooltip();
                        } else {
                            alert('❌ Error desconectando WhatsApp: ' + (response.data || 'Error desconocido'));
                        }
                    },
                    error: function(xhr, status, error) {
                        alert('Error AJAX: ' + error);
                    },
                    complete: function() {
                        $('#disconnect-btn').prop('disabled', false).text('Desconectar WhatsApp');
                    }
                });
            }
            
            // Función para mostrar tooltip después de desconectar
            function showDisconnectTooltip() {
                // Crear tooltip
                var tooltip = $('<div class="disconnect-tooltip">' +
                    '<div class="tooltip-content">' +
                    '<div class="tooltip-icon">💡</div>' +
                    '<div class="tooltip-text">' +
                    '<strong>Consejo:</strong><br>' +
                    'Puedes usar el botón "Actualizar Estado" para obtener un nuevo QR más rápido.<br><br>' +
                    '<strong>Importante:</strong> Deberás seleccionar el grupo nuevamente después de reconectar.' +
                    '</div>' +
                    '<button type="button" class="tooltip-close" onclick="$(this).parent().parent().fadeOut()">×</button>' +
                    '</div>' +
                    '</div>');
                
                // Agregar al footer
                $('.condo360ws-footer').append(tooltip);
                
                // Mostrar con animación
                tooltip.hide().fadeIn(500);
                
                // Auto-ocultar después de 8 segundos
                setTimeout(function() {
                    tooltip.fadeOut(500, function() {
                        $(this).remove();
                    });
                }, 8000);
            }
            
            // Función para verificar grupo configurado
            function checkConfiguredGroup() {
                $.ajax({
                    url: condo360ws_ajax.api_url + '/api/configured-group',
                    type: 'GET',
                    timeout: 5000,
                    success: function(response) {
                        if (response.success && response.data && response.data.groupId) {
                            return true; // Hay grupo configurado
                        } else {
                            return false; // No hay grupo configurado
                        }
                    },
                    error: function() {
                        return false; // Error, asumir que no hay grupo
                    }
                });
            }
            
            // Función para configurar eventos
            function setupEventHandlers() {
                // Remover eventos anteriores
                $(document).off('click', '#load-groups-btn');
                $(document).off('click', '#set-group-btn');
                $(document).off('click', '#disconnect-btn');
                
                // Agregar eventos nuevos
                $(document).on('click', '#load-groups-btn', loadGroups);
                $(document).on('click', '#set-group-btn', setGroup);
                $(document).on('click', '#disconnect-btn', disconnectWhatsApp);
            }
            
            // Inicializar
            function init() {
                // Configurar eventos iniciales
                setupEventHandlers();
                
                // Iniciar verificación automática cada 10 segundos (reducido para evitar rate limits)
                updateInterval = setInterval(checkAPIStatus, 10000);
                
                // Cargar grupos automáticamente si WhatsApp está conectado
                if (isConnected) {
                    setTimeout(loadGroups, 1000);
                }
            }
            
            // Limpiar intervalo al salir
            $(window).on('beforeunload', function() {
                if (updateInterval) {
                    clearInterval(updateInterval);
                }
            });
            
            // Inicializar
            init();
        });
        </script>
        
        <style>
        .condo360ws-container {
            max-width: 800px;
            margin: 20px auto;
            padding: 20px;
            background: #fff;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        
        .condo360ws-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            padding-bottom: 15px;
            border-bottom: 2px solid #f0f0f0;
        }
        
        .condo360ws-header h3 {
            margin: 0;
            color: #333;
        }
        
        .condo360ws-status-indicator {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .status-dot {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background: #dc3545;
        }
        
        .status-dot.connected {
            background: #28a745;
        }
        
        .status-text {
            font-weight: 500;
            color: #666;
        }
        
        .condo360ws-connected {
            text-align: center;
            padding: 20px;
            background: #f8f9fa;
            border-radius: 8px;
        }
        
        .success-icon {
            font-size: 48px;
            color: #28a745;
            margin-bottom: 15px;
        }
        
        .condo360ws-qr {
            text-align: center;
            padding: 20px;
        }
        
        .qr-code-wrapper {
            margin: 20px 0;
        }
        
        .qr-code-wrapper img {
            max-width: 300px;
            border: 2px solid #ddd;
            border-radius: 8px;
        }
        
        .qr-instructions {
            text-align: left;
            max-width: 400px;
            margin: 20px auto;
            padding: 15px;
            background: #f8f9fa;
            border-radius: 6px;
        }
        
        .qr-instructions ol {
            margin: 10px 0;
            padding-left: 20px;
        }
        
        .condo360ws-waiting {
            text-align: center;
            padding: 40px 20px;
            color: #666;
        }
        
        .waiting-icon {
            font-size: 48px;
            margin-bottom: 15px;
        }
        
        .btn-primary, .btn-success, .btn-danger, .btn-secondary {
            padding: 10px 20px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-weight: 500;
            margin: 5px;
            transition: all 0.3s;
        }
        
        .btn-primary {
            background: #007cba;
            color: white;
        }
        
        .btn-success {
            background: #28a745;
            color: white;
        }
        
        .btn-danger {
            background: #dc3545;
            color: white;
        }
        
        .btn-secondary {
            background: #6c757d;
            color: white;
        }
        
        .btn-primary:hover, .btn-success:hover, .btn-danger:hover, .btn-secondary:hover {
            opacity: 0.9;
            transform: translateY(-1px);
        }
        
        .loading-spinner {
            text-align: center;
            padding: 20px;
        }
        
        .spinner {
            border: 3px solid #f3f3f3;
            border-top: 3px solid #007cba;
            border-radius: 50%;
            width: 30px;
            height: 30px;
            animation: spin 1s linear infinite;
            margin: 0 auto 10px;
        }
        
        .selected-group {
            margin-top: 15px;
            padding: 15px;
            background: #f8f9fa;
            border-radius: 4px;
        }
        
        .condo360ws-footer {
            margin-top: 20px;
            padding-top: 15px;
            border-top: 1px solid #f0f0f0;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .last-updated {
            font-size: 12px;
            color: #666;
        }
        
        .error-message {
            color: #dc3545;
            font-weight: 500;
        }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        
        /* Estilos para tooltip de desconexión */
        .disconnect-tooltip {
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 1000;
            max-width: 300px;
            animation: slideInRight 0.5s ease-out;
        }
        
        .tooltip-content {
            background: #fff;
            border: 2px solid #007cba;
            border-radius: 8px;
            padding: 15px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            position: relative;
        }
        
        .tooltip-icon {
            font-size: 20px;
            margin-bottom: 8px;
        }
        
        .tooltip-text {
            font-size: 14px;
            line-height: 1.4;
            color: #333;
        }
        
        .tooltip-close {
            position: absolute;
            top: 5px;
            right: 8px;
            background: none;
            border: none;
            font-size: 18px;
            color: #666;
            cursor: pointer;
            padding: 0;
            width: 20px;
            height: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
        .tooltip-close:hover {
            color: #000;
            background: #f0f0f0;
            border-radius: 50%;
        }
        
        @keyframes slideInRight {
            from {
                transform: translateX(100%);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
        </style>
        <?php
        return ob_get_clean();
    }
    
    /**
     * Obtener estado del API
     */
    private function get_api_status() {
        $url = $this->api_url . '/api/status';
        
        $response = wp_remote_get($url, array(
            'timeout' => 10,
            'headers' => array(
                'Content-Type' => 'application/json',
                'User-Agent' => 'WordPress/' . get_bloginfo('version') . '; ' . home_url()
            )
        ));
        
        if (is_wp_error($response)) {
            return array(
                'connected' => false,
                'qrGenerated' => false,
                'error' => $response->get_error_message()
            );
        }
        
        $http_code = wp_remote_retrieve_response_code($response);
        $body = wp_remote_retrieve_body($response);
        
        if ($http_code !== 200) {
            return array(
                'connected' => false,
                'qrGenerated' => false,
                'error' => "HTTP Error $http_code"
            );
        }
        
        $data = json_decode($body, true);
        
        if (!$data || !$data['success']) {
            return array(
                'connected' => false,
                'qrGenerated' => false,
                'error' => 'API Error'
            );
        }
        
        return array(
            'connected' => $data['data']['connected'] ?? false,
            'qrGenerated' => $data['data']['qrGenerated'] ?? false,
            'error' => null
        );
    }
    
    /**
     * Obtener QR directamente del API
     */
    private function get_qr_direct() {
        $url = $this->api_url . '/api/qr';
        
        $response = wp_remote_get($url, array(
            'timeout' => 10,
            'headers' => array(
                'Content-Type' => 'application/json',
                'User-Agent' => 'WordPress/' . get_bloginfo('version') . '; ' . home_url()
            )
        ));
        
        if (is_wp_error($response)) {
            return false;
        }
        
        $http_code = wp_remote_retrieve_response_code($response);
        $body = wp_remote_retrieve_body($response);
        
        if ($http_code !== 200) {
            return false;
        }
        
        $data = json_decode($body, true);
        
        if ($data && $data['success'] && $data['qr']) {
            return $data['qr'];
        }
        
        return false;
    }
    
    /**
     * AJAX: Obtener grupos de WhatsApp
     */
    public function ajax_get_groups() {
        check_ajax_referer('condo360ws_nonce', 'nonce');
        
        if (!current_user_can('administrator')) {
            wp_die('No tienes permisos para realizar esta acción');
        }
        
        $response = wp_remote_get($this->api_url . '/api/groups', array(
            'timeout' => 30,
            'headers' => array(
                'Content-Type' => 'application/json',
                'User-Agent' => 'WordPress/' . get_bloginfo('version') . '; ' . home_url()
            )
        ));
        
        if (is_wp_error($response)) {
            wp_send_json_error(array(
                'message' => 'Error obteniendo grupos de WhatsApp: ' . $response->get_error_message()
            ));
        }
        
        $http_code = wp_remote_retrieve_response_code($response);
        $body = wp_remote_retrieve_body($response);
        
        if ($http_code !== 200) {
            wp_send_json_error(array(
                'message' => "HTTP Error $http_code: " . $body
            ));
        }
        
        $data = json_decode($body, true);
        
        if ($data && $data['success']) {
            wp_send_json_success(array('groups' => $data['data']));
        } else {
            wp_send_json_error(array(
                'message' => 'Error obteniendo grupos: ' . ($data['error'] ?? 'Error desconocido')
            ));
        }
    }
    
    /**
     * AJAX: Guardar grupo seleccionado en base de datos
     * DEPRECATED: Ahora usamos API Node.js directamente
     */
    /*
    public function ajax_set_group_db() {
        check_ajax_referer('condo360ws_nonce', 'nonce');
        
        if (!current_user_can('administrator')) {
            wp_die('No tienes permisos para realizar esta acción');
        }
        
        $group_id = sanitize_text_field($_POST['group_id'] ?? '');
        $group_name = sanitize_text_field($_POST['group_name'] ?? '');
        
        // Debug logging
        error_log("Condo360 Debug: group_id recibido: " . var_export($group_id, true));
        error_log("Condo360 Debug: group_name recibido: " . var_export($group_name, true));
        error_log("Condo360 Debug: POST completo: " . var_export($_POST, true));
        
        if (empty($group_id)) {
            error_log("Condo360 Debug: group_id está vacío, enviando error");
            wp_send_json_error(array(
                'message' => 'ID de grupo requerido'
            ));
        }
        
        // Guardar en la base de datos
        global $wpdb;
        $config_table = $wpdb->prefix . 'condo360ws_config';
        
        // Verificar que la tabla existe
        $table_exists = $wpdb->get_var("SHOW TABLES LIKE '$config_table'");
        if (!$table_exists) {
            $this->create_tables();
        }
        
        $result = $wpdb->replace(
            $config_table,
            array(
                'config_key' => 'whatsapp_group_id',
                'config_value' => $group_id,
                'updated_at' => current_time('mysql')
            ),
            array('%s', '%s', '%s')
        );
        
        // También guardar el nombre del grupo
        if ($result !== false && !empty($group_name)) {
            $wpdb->replace(
                $config_table,
                array(
                    'config_key' => 'whatsapp_group_name',
                    'config_value' => $group_name,
                    'updated_at' => current_time('mysql')
                ),
                array('%s', '%s', '%s')
            );
        }
        
        if ($result !== false) {
            // Verificar que se guardó correctamente
            $saved_value = $wpdb->get_var($wpdb->prepare(
                "SELECT config_value FROM $config_table WHERE config_key = %s",
                'whatsapp_group_id'
            ));
            
            error_log("Condo360 Debug: Valor guardado verificado: $saved_value");
            
            wp_send_json_success(array(
                'message' => 'Grupo seleccionado correctamente',
                'group_id' => $group_id,
                'group_name' => $group_name,
                'saved_value' => $saved_value
            ));
        } else {
            wp_send_json_error(array(
                'message' => 'Error guardando grupo en base de datos: ' . $wpdb->last_error
            ));
        }
    }
    */
    
    /**
     * AJAX: Desconectar WhatsApp
     */
    public function ajax_disconnect() {
        check_ajax_referer('condo360ws_nonce', 'nonce');
        
        if (!current_user_can('administrator')) {
            wp_die('No tienes permisos para realizar esta acción');
        }
        
        $response = wp_remote_post($this->api_url . '/api/disconnect', array(
            'timeout' => 30,
            'headers' => array(
                'Content-Type' => 'application/json',
                'User-Agent' => 'WordPress/' . get_bloginfo('version') . '; ' . home_url()
            ),
            'body' => json_encode(array(
                'secretKey' => $this->api_secret
            ))
        ));
        
        if (is_wp_error($response)) {
            wp_send_json_error(array(
                'message' => 'Error desconectando WhatsApp: ' . $response->get_error_message()
            ));
        }
        
        $http_code = wp_remote_retrieve_response_code($response);
        $body = wp_remote_retrieve_body($response);
        
        if ($http_code !== 200) {
            wp_send_json_error(array(
                'message' => "HTTP Error $http_code: " . $body
            ));
        }
        
        $data = json_decode($body, true);
        
        if ($data && $data['success']) {
            wp_send_json_success(array(
                'message' => 'WhatsApp desconectado correctamente'
            ));
        } else {
            wp_send_json_error(array(
                'message' => 'Error desconectando WhatsApp: ' . ($data['error'] ?? 'Error desconocido')
            ));
        }
    }
    
    /**
     * Activar plugin
     */
    public function activate() {
        $this->create_tables();
        
        // Limpiar cache
        wp_cache_flush();
    }
    
    /**
     * Desactivar plugin
     */
    public function deactivate() {
        // Limpiar cache
        wp_cache_flush();
    }
}

// Inicializar plugin
new Condo360WhatsAppPlugin();
