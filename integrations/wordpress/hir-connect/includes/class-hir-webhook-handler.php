<?php
/**
 * Webhook receiver for HIR -> WP push notifications.
 *
 * Registers REST route /wp-json/hir-connect/v1/webhook.
 * Validates HMAC-SHA256 signature, deduplicates by delivery id,
 * updates WooCommerce order on known events, and fires the
 * `hir_connect_order_status_changed` action for theme/plugin hooks.
 *
 * @package HIR_Connect
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class HIR_Webhook_Handler
 */
class HIR_Webhook_Handler {

	const ROUTE_NAMESPACE = 'hir-connect/v1';
	const ROUTE_PATH      = '/webhook';
	const DEDUP_TTL       = DAY_IN_SECONDS;

	/**
	 * Map of HIR status -> WC status.
	 *
	 * @var array<string,string>
	 */
	private static $status_map = array(
		'CONFIRMED'    => 'processing',
		'PREPARING'    => 'processing',
		'READY'        => 'processing',
		'PICKED_UP'    => 'out-for-delivery',
		'OUT_FOR_DELIVERY' => 'out-for-delivery',
		'DELIVERED'    => 'completed',
		'CANCELLED'    => 'cancelled',
		'FAILED'       => 'failed',
	);

	/**
	 * Plugin reference.
	 *
	 * @var HIR_Connect
	 */
	private $plugin;

	/**
	 * Constructor.
	 *
	 * @param HIR_Connect $plugin Plugin instance.
	 */
	public function __construct( HIR_Connect $plugin ) {
		$this->plugin = $plugin;
		add_action( 'rest_api_init', array( $this, 'register_route' ) );
	}

	/**
	 * Register the REST route.
	 */
	public function register_route() {
		register_rest_route(
			self::ROUTE_NAMESPACE,
			self::ROUTE_PATH,
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'handle' ),
				'permission_callback' => '__return_true', // signature is the auth
			)
		);
	}

	/**
	 * Build the public webhook URL for display in settings.
	 *
	 * @return string
	 */
	public function get_public_url() {
		return rest_url( self::ROUTE_NAMESPACE . self::ROUTE_PATH );
	}

	/**
	 * Handle an inbound webhook.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public function handle( WP_REST_Request $request ) {
		$secret = (string) $this->plugin->get_option( 'webhook_secret', '' );
		if ( '' === $secret ) {
			return new WP_REST_Response( array( 'error' => 'webhook_secret_missing' ), 401 );
		}

		$body      = $request->get_body();
		$signature = (string) $request->get_header( 'x-hir-signature' );
		$event     = (string) $request->get_header( 'x-hir-event' );
		$delivery  = (string) $request->get_header( 'x-hir-delivery' );

		if ( '' === $signature || ! $this->verify_signature( $body, $signature, $secret ) ) {
			return new WP_REST_Response( array( 'error' => 'bad_signature' ), 401 );
		}

		// Idempotency: reject duplicate delivery IDs (24h window).
		if ( '' !== $delivery ) {
			$transient_key = 'hir_wh_' . md5( $delivery );
			if ( false !== get_transient( $transient_key ) ) {
				return new WP_REST_Response( array( 'ok' => true, 'duplicate' => true ), 200 );
			}
			set_transient( $transient_key, 1, self::DEDUP_TTL );
		}

		$payload = json_decode( $body, true );
		if ( ! is_array( $payload ) ) {
			return new WP_REST_Response( array( 'error' => 'bad_json' ), 400 );
		}

		switch ( $event ) {
			case 'order.status_changed':
				return $this->handle_order_status( $payload );
			case 'order.eta_updated':
				return $this->handle_eta_updated( $payload );
			case 'order.courier_assigned':
				return $this->handle_courier_assigned( $payload );
			default:
				/**
				 * Allow other plugins/themes to handle unknown event types.
				 *
				 * @param string $event   Event name.
				 * @param array  $payload Decoded body.
				 */
				do_action( 'hir_connect_unknown_event', $event, $payload );
				return new WP_REST_Response( array( 'error' => 'unknown_event' ), 404 );
		}
	}

	/**
	 * Constant-time signature verification.
	 *
	 * @param string $body      Raw body.
	 * @param string $signature Provided signature (hex).
	 * @param string $secret    Shared secret.
	 * @return bool
	 */
	private function verify_signature( $body, $signature, $secret ) {
		$expected = hash_hmac( 'sha256', $body, $secret );
		return hash_equals( $expected, $signature );
	}

	/**
	 * Handle an order.status_changed event.
	 *
	 * @param array $payload Payload.
	 * @return WP_REST_Response
	 */
	private function handle_order_status( array $payload ) {
		$hir_order_id        = isset( $payload['hir_order_id'] ) ? (string) $payload['hir_order_id'] : '';
		$external_order_id   = isset( $payload['external_order_id'] ) ? (string) $payload['external_order_id'] : '';
		$status              = isset( $payload['status'] ) ? (string) $payload['status'] : '';

		if ( '' === $status ) {
			return new WP_REST_Response( array( 'error' => 'missing_status' ), 400 );
		}

		// Update WC order if WC active.
		if ( class_exists( 'WooCommerce' ) && '' !== $external_order_id && function_exists( 'wc_get_order' ) ) {
			$order = wc_get_order( (int) $external_order_id );
			if ( $order ) {
				$wc_status = isset( self::$status_map[ $status ] ) ? self::$status_map[ $status ] : null;
				if ( $wc_status ) {
					$order->update_status(
						$wc_status,
						sprintf(
							/* translators: %s: HIR status */
							__( 'HIR webhook: %s', 'hir-connect' ),
							sanitize_text_field( $status )
						)
					);
				}
				if ( '' !== $hir_order_id ) {
					$order->update_meta_data( '_hir_order_id', sanitize_text_field( $hir_order_id ) );
				}
				if ( isset( $payload['tracking_url'] ) ) {
					$order->update_meta_data( '_hir_tracking_url', esc_url_raw( (string) $payload['tracking_url'] ) );
				}
				if ( isset( $payload['eta_minutes'] ) ) {
					$order->update_meta_data( '_hir_eta_minutes', (int) $payload['eta_minutes'] );
				}
				$order->save();
			}
		}

		/**
		 * Fires when HIR reports an order status change.
		 *
		 * @param string $status            HIR status (DELIVERED, PICKED_UP, etc).
		 * @param string $external_order_id Local order id.
		 * @param string $hir_order_id      HIR order id.
		 * @param array  $payload           Full payload.
		 */
		do_action( 'hir_connect_order_status_changed', $status, $external_order_id, $hir_order_id, $payload );

		return new WP_REST_Response( array( 'ok' => true ), 200 );
	}

	/**
	 * Handle an order.eta_updated event.
	 *
	 * @param array $payload Payload.
	 * @return WP_REST_Response
	 */
	private function handle_eta_updated( array $payload ) {
		$external_order_id = isset( $payload['external_order_id'] ) ? (int) $payload['external_order_id'] : 0;
		$eta_minutes       = isset( $payload['eta_minutes'] ) ? (int) $payload['eta_minutes'] : 0;

		if ( class_exists( 'WooCommerce' ) && $external_order_id > 0 && function_exists( 'wc_get_order' ) ) {
			$order = wc_get_order( $external_order_id );
			if ( $order ) {
				$order->update_meta_data( '_hir_eta_minutes', $eta_minutes );
				$order->save();
			}
		}

		do_action( 'hir_connect_eta_updated', $external_order_id, $eta_minutes, $payload );
		return new WP_REST_Response( array( 'ok' => true ), 200 );
	}

	/**
	 * Handle an order.courier_assigned event.
	 *
	 * @param array $payload Payload.
	 * @return WP_REST_Response
	 */
	private function handle_courier_assigned( array $payload ) {
		$external_order_id = isset( $payload['external_order_id'] ) ? (int) $payload['external_order_id'] : 0;
		$courier_name      = isset( $payload['courier']['name'] ) ? (string) $payload['courier']['name'] : '';

		if ( class_exists( 'WooCommerce' ) && $external_order_id > 0 && function_exists( 'wc_get_order' ) ) {
			$order = wc_get_order( $external_order_id );
			if ( $order ) {
				$order->update_meta_data( '_hir_courier_name', sanitize_text_field( $courier_name ) );
				$order->save();
			}
		}

		do_action( 'hir_connect_courier_assigned', $external_order_id, $courier_name, $payload );
		return new WP_REST_Response( array( 'ok' => true ), 200 );
	}
}
