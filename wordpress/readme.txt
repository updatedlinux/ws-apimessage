=== Condo360 WhatsApp Service ===
Contributors: condo360
Tags: whatsapp, messaging, qr, groups, condo360
Requires at least: 5.0
Tested up to: 6.4
Requires PHP: 7.4
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Plugin para conectar WhatsApp con el servicio Condo360 usando QR y gestionar grupos.

== Description ==

El plugin Condo360 WhatsApp Service permite conectar WhatsApp con tu sitio WordPress usando un código QR y gestionar grupos de WhatsApp directamente desde el panel de administración.

**Características principales:**

* Conexión a WhatsApp mediante código QR
* Visualización del estado de conexión en tiempo real
* Gestión de grupos de WhatsApp disponibles
* Configuración de grupo de destino para mensajes
* Interfaz solo visible para administradores
* Actualización automática del estado
* Envío de mensajes a grupos configurados

**Uso:**

1. Instala y activa el plugin
2. Ve a Configuración > WhatsApp Service para configurar la URL del API
3. Usa el shortcode `[wa_connect_qr]` en cualquier página o entrada
4. Escanea el código QR con WhatsApp para conectar
5. Carga y selecciona el grupo de destino

**Requisitos:**

* Servicio Condo360 WhatsApp API funcionando
* WordPress 5.0 o superior
* PHP 7.4 o superior
* Permisos de administrador para usar el shortcode

== Installation ==

1. Sube la carpeta `condo360-whatsapp` al directorio `/wp-content/plugins/`
2. Activa el plugin desde el menú 'Plugins' en WordPress
3. Ve a Configuración > WhatsApp Service para configurar la URL del API
4. Usa el shortcode `[wa_connect_qr]` en cualquier página o entrada

== Frequently Asked Questions ==

= ¿Cómo funciona la conexión a WhatsApp? =

El plugin se conecta al servicio Condo360 WhatsApp API que utiliza whatsapp-web.js para establecer la conexión. Se genera un código QR que debes escanear con WhatsApp en tu teléfono.

= ¿Quién puede ver el shortcode? =

Solo los usuarios con permisos de administrador pueden ver el shortcode y su contenido.

= ¿Cómo configuro el grupo de destino? =

Una vez conectado WhatsApp, puedes cargar los grupos disponibles y seleccionar uno como grupo de destino para enviar mensajes.

= ¿Qué pasa si el código QR expira? =

El plugin actualiza automáticamente el código QR cada 10 segundos si no hay conexión establecida.

== Screenshots ==

1. Estado de conexión y código QR
2. Interfaz de grupos disponibles
3. Configuración del grupo de destino
4. Panel de administración

== Changelog ==

= 1.0.0 =
* Lanzamiento inicial
* Conexión a WhatsApp mediante QR
* Gestión de grupos
* Configuración de grupo de destino
* Interfaz de administración

== Upgrade Notice ==

= 1.0.0 =
Primera versión del plugin Condo360 WhatsApp Service.
