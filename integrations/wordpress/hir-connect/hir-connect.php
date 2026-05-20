<?php
/**
 * Plugin Name:       HIR Connect
 * Plugin URI:        https://hirforyou.ro/connect
 * Description:       Connect your WordPress / WooCommerce site to HIR for last-mile delivery, AI agents, upsell suggestions, and real-time order tracking.
 * Version:           1.0.0
 * Author:            HIR
 * Author URI:        https://hirforyou.ro
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       hir-connect
 * Domain Path:       /languages
 * Requires at least: 5.8
 * Tested up to:      6.9
 * Requires PHP:      7.4
 * WC requires at least: 6.0
 * WC tested up to:   9.0
 *
 * @package HIR_Connect
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'HIR_CONNECT_VERSION', '1.0.0' );
define( 'HIR_CONNECT_PLUGIN_FILE', __FILE__ );
define( 'HIR_CONNECT_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'HIR_CONNECT_PLUGIN_URL', plugin_dir_url( __FILE__ ) );
define( 'HIR_CONNECT_PLUGIN_BASENAME', plugin_basename( __FILE__ ) );
define( 'HIR_CONNECT_DEFAULT_ENDPOINT', 'https://hirforyou.ro' );

require_once HIR_CONNECT_PLUGIN_DIR . 'includes/class-hir-connect.php';
require_once HIR_CONNECT_PLUGIN_DIR . 'includes/class-hir-api-client.php';
require_once HIR_CONNECT_PLUGIN_DIR . 'includes/class-hir-webhook-handler.php';
require_once HIR_CONNECT_PLUGIN_DIR . 'includes/class-hir-settings.php';
require_once HIR_CONNECT_PLUGIN_DIR . 'includes/class-hir-upsell.php';
require_once HIR_CONNECT_PLUGIN_DIR . 'includes/class-hir-woocommerce.php';
require_once HIR_CONNECT_PLUGIN_DIR . 'includes/class-hir-elementor.php';

register_activation_hook( __FILE__, array( 'HIR_Connect', 'activate' ) );
register_deactivation_hook( __FILE__, array( 'HIR_Connect', 'deactivate' ) );

add_action( 'plugins_loaded', array( 'HIR_Connect', 'instance' ) );
