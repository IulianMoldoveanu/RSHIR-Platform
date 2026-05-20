<?php
/**
 * Main plugin bootstrap.
 *
 * @package HIR_Connect
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class HIR_Connect
 *
 * Singleton bootstrap that wires up sub-modules.
 */
class HIR_Connect {

	const OPTION_KEY      = 'hir_connect_options';
	const CRON_RETRY_HOOK = 'hir_connect_retry_queue';
	const TEXTDOMAIN      = 'hir-connect';

	/**
	 * Singleton instance.
	 *
	 * @var HIR_Connect|null
	 */
	private static $instance = null;

	/**
	 * API client.
	 *
	 * @var HIR_API_Client
	 */
	public $api;

	/**
	 * Settings module.
	 *
	 * @var HIR_Settings
	 */
	public $settings;

	/**
	 * Webhook handler.
	 *
	 * @var HIR_Webhook_Handler
	 */
	public $webhook;

	/**
	 * Upsell module.
	 *
	 * @var HIR_Upsell
	 */
	public $upsell;

	/**
	 * WooCommerce integration.
	 *
	 * @var HIR_WooCommerce|null
	 */
	public $wc;

	/**
	 * Elementor integration.
	 *
	 * @var HIR_Elementor|null
	 */
	public $elementor;

	/**
	 * Get singleton instance.
	 *
	 * @return HIR_Connect
	 */
	public static function instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	/**
	 * Constructor.
	 */
	private function __construct() {
		$this->load_textdomain();
		$this->boot();
	}

	/**
	 * Load translations.
	 */
	private function load_textdomain() {
		load_plugin_textdomain(
			self::TEXTDOMAIN,
			false,
			dirname( HIR_CONNECT_PLUGIN_BASENAME ) . '/languages'
		);
	}

	/**
	 * Wire up modules and WP hooks.
	 */
	private function boot() {
		$this->api      = new HIR_API_Client( $this );
		$this->settings = new HIR_Settings( $this );
		$this->webhook  = new HIR_Webhook_Handler( $this );
		$this->upsell   = new HIR_Upsell( $this );

		if ( class_exists( 'WooCommerce' ) ) {
			$this->wc = new HIR_WooCommerce( $this );
		}

		// Elementor Pro Forms (for non-WC sites like deliveryhouse.ro).
		add_action( 'elementor_pro/init', array( $this, 'init_elementor' ) );

		add_action( self::CRON_RETRY_HOOK, array( $this, 'process_retry_queue' ) );

		// Shortcode for tracking embed.
		add_shortcode( 'hir_tracking', array( $this, 'shortcode_tracking' ) );
	}

	/**
	 * Late-bind Elementor module once Elementor Pro is available.
	 */
	public function init_elementor() {
		if ( ! class_exists( 'ElementorPro\Modules\Forms\Module' ) ) {
			return;
		}
		$this->elementor = new HIR_Elementor( $this );
	}

	/**
	 * Get plugin option.
	 *
	 * @param string $key     Option key.
	 * @param mixed  $default Default value.
	 * @return mixed
	 */
	public function get_option( $key, $default = '' ) {
		$opts = get_option( self::OPTION_KEY, array() );
		return isset( $opts[ $key ] ) ? $opts[ $key ] : $default;
	}

	/**
	 * Update plugin options.
	 *
	 * @param array $options Options array.
	 * @return bool
	 */
	public function update_options( array $options ) {
		return update_option( self::OPTION_KEY, $options );
	}

	/**
	 * Is plugin enabled (master switch).
	 *
	 * @return bool
	 */
	public function is_enabled() {
		return '1' === (string) $this->get_option( 'enabled', '1' );
	}

	/**
	 * Process pending retry payloads via WP cron.
	 */
	public function process_retry_queue() {
		$queue = get_option( 'hir_connect_retry_queue', array() );
		if ( empty( $queue ) || ! is_array( $queue ) ) {
			return;
		}

		$remaining = array();
		foreach ( $queue as $item ) {
			$attempts = isset( $item['attempts'] ) ? (int) $item['attempts'] : 0;
			if ( $attempts >= 5 ) {
				// Give up after 5 attempts.
				error_log( 'HIR Connect: giving up on payload after 5 attempts: ' . wp_json_encode( $item ) );
				continue;
			}

			$response = $this->api->post_order( $item['payload'] );
			if ( is_wp_error( $response ) ) {
				$item['attempts'] = $attempts + 1;
				$remaining[]      = $item;
				continue;
			}

			// Success: if associated WC order, update meta.
			if ( ! empty( $item['wc_order_id'] ) && function_exists( 'wc_get_order' ) ) {
				$order = wc_get_order( $item['wc_order_id'] );
				if ( $order && ! empty( $response['order_id'] ) ) {
					$order->update_meta_data( '_hir_order_id', sanitize_text_field( $response['order_id'] ) );
					if ( ! empty( $response['tracking_url'] ) ) {
						$order->update_meta_data( '_hir_tracking_url', esc_url_raw( $response['tracking_url'] ) );
					}
					if ( isset( $response['eta_minutes'] ) ) {
						$order->update_meta_data( '_hir_eta_minutes', (int) $response['eta_minutes'] );
					}
					$order->save();
				}
			}
		}

		update_option( 'hir_connect_retry_queue', $remaining, false );
	}

	/**
	 * Tracking shortcode renderer.
	 *
	 * Usage: [hir_tracking order_id="123"]
	 *
	 * @param array $atts Shortcode attributes.
	 * @return string
	 */
	public function shortcode_tracking( $atts ) {
		$atts = shortcode_atts(
			array(
				'order_id' => '',
				'height'   => '600',
			),
			$atts,
			'hir_tracking'
		);

		$order_id = sanitize_text_field( $atts['order_id'] );
		if ( '' === $order_id && function_exists( 'wc_get_order' ) ) {
			// Try query var on order-received page.
			global $wp;
			if ( ! empty( $wp->query_vars['order-received'] ) ) {
				$wc_order = wc_get_order( (int) $wp->query_vars['order-received'] );
				if ( $wc_order ) {
					$order_id = (string) $wc_order->get_meta( '_hir_order_id' );
				}
			}
		}

		if ( '' === $order_id ) {
			return '<div class="hir-tracking hir-tracking--empty">' .
				esc_html__( 'No HIR order found.', 'hir-connect' ) .
				'</div>';
		}

		$endpoint     = $this->get_option( 'endpoint', HIR_CONNECT_DEFAULT_ENDPOINT );
		$tracking_url = trailingslashit( $endpoint ) . 'track/' . rawurlencode( $order_id );
		$height       = max( 200, (int) $atts['height'] );

		return sprintf(
			'<div class="hir-tracking"><iframe src="%1$s" style="width:100%%;height:%2$dpx;border:0" loading="lazy" title="%3$s"></iframe></div>',
			esc_url( $tracking_url ),
			$height,
			esc_attr__( 'HIR delivery tracking', 'hir-connect' )
		);
	}

	/**
	 * Plugin activation hook.
	 */
	public static function activate() {
		$defaults = array(
			'endpoint'       => HIR_CONNECT_DEFAULT_ENDPOINT,
			'api_key'        => '',
			'tenant_slug'    => '',
			'webhook_secret' => '',
			'enabled'        => '1',
			'show_upsell'    => '1',
		);
		$existing = get_option( self::OPTION_KEY, array() );
		update_option( self::OPTION_KEY, array_merge( $defaults, (array) $existing ) );

		if ( ! wp_next_scheduled( self::CRON_RETRY_HOOK ) ) {
			wp_schedule_event( time() + 300, 'hourly', self::CRON_RETRY_HOOK );
		}

		flush_rewrite_rules();
	}

	/**
	 * Plugin deactivation hook.
	 */
	public static function deactivate() {
		$timestamp = wp_next_scheduled( self::CRON_RETRY_HOOK );
		if ( $timestamp ) {
			wp_unschedule_event( $timestamp, self::CRON_RETRY_HOOK );
		}
		flush_rewrite_rules();
	}
}
