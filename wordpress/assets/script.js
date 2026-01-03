/**
 * JavaScript para el shortcode de WhatsApp Condo360
 * Maneja la actualización automática del estado y QR
 */

(function($) {
    'use strict';

    let refreshInterval = null;
    let isRefreshing = false;

    /**
     * Inicialización cuando el documento está listo
     */
    $(document).ready(function() {
        console.log('Condo360 WhatsApp: Inicializando...');
        initializeWhatsAppWidget();
    });

    /**
     * Inicializa el widget de WhatsApp
     */
    function initializeWhatsAppWidget() {
        const container = $('.condo360ws-container');
        
        console.log('Condo360 WhatsApp: Container encontrado:', container.length);
        
        if (container.length === 0) {
            console.log('Condo360 WhatsApp: No se encontró el container');
            return;
        }

        const autoRefresh = container.data('auto-refresh') === true;
        const refreshIntervalMs = parseInt(container.data('refresh-interval')) || 10000;
        
        console.log('Condo360 WhatsApp: Auto refresh:', autoRefresh, 'Interval:', refreshIntervalMs);

        // Configurar botón de actualización manual
        $('#condo360ws-refresh-btn').on('click', function() {
            refreshStatus();
        });

        // Configurar botón de cargar grupos
        $('#condo360ws-load-groups-btn').on('click', function() {
            loadGroups();
        });

        // Configurar botón de configurar grupo
        $('#condo360ws-set-group-btn').on('click', function() {
            setSelectedGroup();
        });

        // Actualización inicial
        console.log('Condo360 WhatsApp: Iniciando actualización inicial...');
        refreshStatus();

        // Configurar actualización automática si está habilitada
        if (autoRefresh) {
            console.log('Condo360 WhatsApp: Iniciando auto refresh...');
            startAutoRefresh(refreshIntervalMs);
        }

        // Detener actualización automática cuando la página no está visible
        $(document).on('visibilitychange', function() {
            if (document.hidden) {
                stopAutoRefresh();
            } else if (autoRefresh) {
                startAutoRefresh(refreshIntervalMs);
            }
        });
    }

    /**
     * Actualiza el estado de WhatsApp
     */
    function refreshStatus() {
        if (isRefreshing) {
            console.log('Condo360 WhatsApp: Ya está refrescando, saltando...');
            return;
        }

        console.log('Condo360 WhatsApp: Iniciando refresh...');
        isRefreshing = true;
        updateLastRefreshTime();
        setLoadingState(true);

        // Verificar que las variables AJAX estén disponibles
        if (typeof condo360ws_ajax === 'undefined') {
            console.error('Condo360 WhatsApp: Variables AJAX no disponibles');
            handleError('Error: Variables AJAX no disponibles');
            isRefreshing = false;
            setLoadingState(false);
            return;
        }

        console.log('Condo360 WhatsApp: Enviando petición AJAX...', {
            url: condo360ws_ajax.ajax_url,
            action: 'condo360ws_get_status',
            nonce: condo360ws_ajax.nonce
        });

        // Obtener estado actual
        $.ajax({
            url: condo360ws_ajax.ajax_url,
            type: 'POST',
            data: {
                action: 'condo360ws_get_status',
                nonce: condo360ws_ajax.nonce
            },
            success: function(response) {
                console.log('Condo360 WhatsApp: Respuesta AJAX recibida:', response);
                if (response.success) {
                    handleStatusUpdate(response.data);
                } else {
                    handleError(response.data.message || condo360ws_ajax.strings.error_loading);
                }
            },
            error: function(xhr, status, error) {
                console.error('Condo360 WhatsApp: Error AJAX:', xhr, status, error);
                handleError(condo360ws_ajax.strings.error_loading + ': ' + error);
            },
            complete: function() {
                console.log('Condo360 WhatsApp: Petición AJAX completada');
                isRefreshing = false;
                setLoadingState(false);
            }
        });
    }

    /**
     * Maneja la actualización del estado
     */
    function handleStatusUpdate(status) {
        console.log('Condo360 WhatsApp: Procesando estado:', status);
        
        const container = $('.condo360ws-container');
        const statusIndicator = $('#condo360ws-status');
        const statusDot = statusIndicator.find('.status-dot');
        const statusText = statusIndicator.find('.status-text');
        const qrContainer = $('#condo360ws-qr-container');
        const connectedContainer = $('#condo360ws-connected');
        const errorContainer = $('#condo360ws-error');

        // Limpiar estados anteriores
        qrContainer.hide();
        connectedContainer.hide();
        errorContainer.hide();

        if (status.connected) {
            // WhatsApp está conectado
            console.log('Condo360 WhatsApp: Estado conectado');
            statusDot.removeClass('checking disconnected').addClass('connected');
            statusText.text(condo360ws_ajax.strings.connected);
            connectedContainer.show().addClass('fade-in');
            
            // Cargar grupos automáticamente cuando está conectado
            loadGroups();
            
            // Detener actualización automática cuando está conectado
            stopAutoRefresh();
            
        } else if (status.qrGenerated) {
            // Hay un QR disponible
            console.log('Condo360 WhatsApp: QR generado, cargando...');
            statusDot.removeClass('connected disconnected').addClass('checking');
            statusText.text(condo360ws_ajax.strings.scan_qr);
            loadQRCode();
            
        } else {
            // No hay conexión ni QR
            console.log('Condo360 WhatsApp: Sin conexión ni QR');
            statusDot.removeClass('connected checking').addClass('disconnected');
            statusText.text(condo360ws_ajax.strings.disconnected);
            errorContainer.show().addClass('fade-in');
        }
    }

    /**
     * Carga el código QR
     */
    function loadQRCode() {
        $.ajax({
            url: condo360ws_ajax.ajax_url,
            type: 'POST',
            data: {
                action: 'condo360ws_get_qr',
                nonce: condo360ws_ajax.nonce
            },
            success: function(response) {
                if (response.success && response.data.qr) {
                    const qrContainer = $('#condo360ws-qr-container');
                    const qrImage = $('#condo360ws-qr-image');
                    
                    // El QR viene en base64, necesitamos agregar el prefijo data:image/png;base64,
                    const qrDataUrl = 'data:image/png;base64,' + response.data.qr;
                    qrImage.attr('src', qrDataUrl);
                    qrContainer.show().addClass('fade-in');
                    
                    // Verificar si el QR ha expirado
                    if (response.data.expiresAt) {
                        const expiresAt = new Date(response.data.expiresAt);
                        const now = new Date();
                        const timeUntilExpiry = expiresAt.getTime() - now.getTime();
                        
                        if (timeUntilExpiry > 0) {
                            setTimeout(function() {
                                if (!$('#condo360ws-connected').is(':visible')) {
                                    handleQRExpired();
                                }
                            }, timeUntilExpiry);
                        }
                    }
                } else {
                    handleError(response.data.message || 'Error obteniendo código QR');
                }
            },
            error: function(xhr, status, error) {
                handleError('Error cargando código QR: ' + error);
            }
        });
    }

    /**
     * Maneja cuando el QR ha expirado
     */
    function handleQRExpired() {
        const qrContainer = $('#condo360ws-qr-container');
        const errorContainer = $('#condo360ws-error');
        
        qrContainer.hide();
        errorContainer.show().addClass('fade-in qr-expired');
        
        $('#condo360ws-error-message').text(condo360ws_ajax.strings.qr_expired);
        
        // Intentar obtener un nuevo QR después de un breve delay
        setTimeout(function() {
            refreshStatus();
        }, 2000);
    }

    /**
     * Maneja errores
     */
    function handleError(message) {
        const errorContainer = $('#condo360ws-error');
        const statusIndicator = $('#condo360ws-status');
        const statusDot = statusIndicator.find('.status-dot');
        const statusText = statusIndicator.find('.status-text');
        
        statusDot.removeClass('connected checking').addClass('disconnected');
        statusText.text(condo360ws_ajax.strings.disconnected);
        
        $('#condo360ws-error-message').text(message);
        errorContainer.show().addClass('fade-in');
        
        // Ocultar otros contenedores
        $('#condo360ws-qr-container').hide();
        $('#condo360ws-connected').hide();
    }

    /**
     * Establece el estado de carga
     */
    function setLoadingState(loading) {
        const container = $('.condo360ws-container');
        const refreshBtn = $('#condo360ws-refresh-btn');
        
        if (loading) {
            container.addClass('condo360ws-loading');
            refreshBtn.prop('disabled', true).text('Actualizando...');
        } else {
            container.removeClass('condo360ws-loading');
            refreshBtn.prop('disabled', false).text('Actualizar Estado');
        }
    }

    /**
     * Actualiza el tiempo de última actualización
     */
    function updateLastRefreshTime() {
        const now = new Date();
        const timeString = now.toLocaleTimeString();
        $('#condo360ws-last-update').text(timeString);
    }

    /**
     * Inicia la actualización automática
     */
    function startAutoRefresh(interval) {
        stopAutoRefresh(); // Limpiar interval anterior si existe
        
        refreshInterval = setInterval(function() {
            // Solo actualizar si no está conectado
            if (!$('#condo360ws-connected').is(':visible')) {
                refreshStatus();
            }
        }, interval);
    }

    /**
     * Detiene la actualización automática
     */
    function stopAutoRefresh() {
        if (refreshInterval) {
            clearInterval(refreshInterval);
            refreshInterval = null;
        }
    }

    /**
     * Función para enviar mensaje (para uso futuro)
     */
    function sendMessage(message) {
        return $.ajax({
            url: condo360ws_ajax.ajax_url,
            type: 'POST',
            data: {
                action: 'condo360ws_send_message',
                nonce: condo360ws_ajax.nonce,
                message: message
            }
        });
    }

    /**
     * Carga los grupos disponibles
     */
    function loadGroups() {
        const loadBtn = $('#condo360ws-load-groups-btn');
        const groupsContainer = $('#condo360ws-groups-container');
        const groupsLoading = $('#condo360ws-groups-loading');
        const groupsList = $('#condo360ws-groups-list');

        // Mostrar contenedor y loading
        groupsContainer.show();
        groupsLoading.show();
        groupsList.empty();
        loadBtn.prop('disabled', true).text('Cargando...');

        $.ajax({
            url: condo360ws_ajax.ajax_url,
            type: 'POST',
            data: {
                action: 'condo360ws_get_groups',
                nonce: condo360ws_ajax.nonce
            },
            success: function(response) {
                groupsLoading.hide();
                
                if (response.success && response.data.length > 0) {
                    displayGroups(response.data);
                } else {
                    displayNoGroups();
                }
            },
            error: function(xhr, status, error) {
                groupsLoading.hide();
                displayGroupsError('Error cargando grupos: ' + error);
            },
            complete: function() {
                loadBtn.prop('disabled', false).text('Cargar Grupos');
            }
        });
    }

    /**
     * Muestra la lista de grupos
     */
    function displayGroups(groups) {
        const groupsList = $('#condo360ws-groups-list');
        
        groups.forEach(function(group) {
            const groupItem = $('<div class="group-item" data-group-id="' + group.id + '">')
                .append(
                    $('<div class="group-info">')
                        .append($('<span class="group-name">').text(group.subject))
                        .append($('<span class="group-details">').text(group.participants + ' participantes'))
                )
                .append($('<span class="group-id">').text(group.id));

            groupsList.append(groupItem);
        });

        // Configurar click en grupos
        $('.group-item').on('click', function() {
            selectGroup($(this));
        });
    }

    /**
     * Muestra mensaje cuando no hay grupos
     */
    function displayNoGroups() {
        const groupsList = $('#condo360ws-groups-list');
        groupsList.html(
            '<div class="no-groups-message">' +
                '<span class="icon">📭</span>' +
                'No se encontraron grupos disponibles'
            '</div>'
        );
    }

    /**
     * Muestra error al cargar grupos
     */
    function displayGroupsError(message) {
        const groupsList = $('#condo360ws-groups-list');
        groupsList.html(
            '<div class="no-groups-message">' +
                '<span class="icon">⚠️</span>' +
                message
            '</div>'
        );
    }

    /**
     * Selecciona un grupo
     */
    function selectGroup(groupElement) {
        // Remover selección anterior
        $('.group-item').removeClass('selected');
        
        // Seleccionar grupo actual
        groupElement.addClass('selected');
        
        // Obtener información del grupo
        const groupId = groupElement.data('group-id');
        const groupName = groupElement.find('.group-name').text();
        
        // Mostrar información del grupo seleccionado
        const selectedGroup = $('#condo360ws-selected-group');
        selectedGroup.find('.group-name').text(groupName);
        selectedGroup.find('.group-id').text(groupId);
        selectedGroup.show();
    }

    /**
     * Configura el grupo seleccionado como grupo de destino
     */
    function setSelectedGroup() {
        const selectedGroup = $('#condo360ws-selected-group');
        const groupId = selectedGroup.find('.group-id').text();
        const groupName = selectedGroup.find('.group-name').text();
        const setBtn = $('#condo360ws-set-group-btn');

        if (!groupId) {
            alert('No hay grupo seleccionado');
            return;
        }

        setBtn.prop('disabled', true).text('Configurando...');

        $.ajax({
            url: condo360ws_ajax.ajax_url,
            type: 'POST',
            data: {
                action: 'condo360ws_set_group_db',
                nonce: condo360ws_ajax.nonce,
                group_id: groupId,
                group_name: groupName
            },
            success: function(response) {
                if (response.success) {
                    alert('Grupo "' + groupName + '" configurado correctamente como destino.\nID: ' + groupId);
                    // Opcional: recargar la página o actualizar estado
                    refreshStatus();
                } else {
                    alert('Error configurando grupo: ' + (response.data.message || 'Error desconocido'));
                }
            },
            error: function(xhr, status, error) {
                alert('Error configurando grupo: ' + error);
            },
            complete: function() {
                setBtn.prop('disabled', false).text('Configurar como Grupo de Destino');
            }
        });
    }

    // Exponer funciones globalmente para uso externo
    window.condo360ws = {
        refreshStatus: refreshStatus,
        sendMessage: sendMessage,
        loadGroups: loadGroups,
        selectGroup: selectGroup,
        setSelectedGroup: setSelectedGroup,
        startAutoRefresh: startAutoRefresh,
        stopAutoRefresh: stopAutoRefresh
    };

})(jQuery);
