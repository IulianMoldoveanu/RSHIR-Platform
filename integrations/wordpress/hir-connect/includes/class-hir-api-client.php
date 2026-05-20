<?php
/**
 * HIR API client.
 *
 * Talks to hirforyou.ro public API endpoints. Times out at 10s and
 * never throws — returns WP_Error on transport failures so callers
 * can queue retries instead of breaking the customer flow.
 *
 * @package HIR_Connect
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class HIR_API_Client
 */
class HIR_API_Client {

	const TIMEOUT_SECONDS = 10;
	const USER_AGENT      = 'HIR-Connect/1.0 (+https://hirforyou.ro)';

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
	}

	/**
	 * Build endpoint URL.
	 *
	 * @param string $path Relative API path (must start with /).
	 * @return string
	 */
	private function url( $path ) {
		$base = (string) $this->plugin->get_option( 'endpoint', HIR_CONNECT_DEFAULT_ENDPOINT );
		$base = untrailingslashit( $base );
		return $base . $path;
	}

	/**
	 * Default request headers.
	 *
	 * @return array<string,string>
	 */
	private function headers() {
		$key = (string) $this->plugin->get_option( 'api_key', '' );
		return array(
			'Authorization'    => 'Bearer ' . $key,
			'Content-Type'     => 'application/json',
			'Accept'           => 'application/json',
			'X-HIR-Client'     => 'wordpress-plugin',
			'X-HIR-Client-Ver' => HIR_CONNECT_VERSION,
		);
	}

	/**
	 * Lightweight ping for the settings page "Test connection" button.
	 *
	 * @return array{ok:bool,message:string}
	 */
	public function ping() {
		$key = (string) $this->plugin->get_option( 'api_key', '' );
		if ( '' === $key ) {
			return array(
				'ok'      => false,
				'message' => __( 'API key is empty.', 'hir-connect' ),
			);
		}

		$response = wp_remote_get(
			$this->url( '/api/public/v1/ping' ),
			array(
				'timeout'   => self::TIMEOUT_SECONDS,
				'headers'   => $this->headers(),
				'user-agent' => self::USER_AGENT,
			)
		);

		if ( is_wp_error( $response ) ) {
			return array(
				'ok'      => false,
				'message' => $response->get_error_message(),
			);
		}

		$code = wp_remote_retrieve_response_code( $response );
		if ( 200 !== (int) $code ) {
			return array(
				'ok'      => false,
				'message' => sprintf(
					/* translators: %d: HTTP status code */
					__( 'HIR returned HTTP %d.', 'hir-connect' ),
					(int) $code
				),
			);
		}

		$body = json_decode( wp_remote_retrieve_body( $response ), true );
		$slug = isset( $body['tenant_slug'] ) ? (string) $body['tenant_slug'] : '';

		// Cache tenant slug from server response.
		if ( '' !== $slug ) {
			$opts                = (array) get_option( HIR_Connect::OPTION_KEY, array() );
			$opts['tenant_slug'] = sanitize_title( $slug );
			update_option( HIR_Connect::OPTION_KEY, $opts );
		}

		return array(
			'ok'      => true,
			'message' => '' !== $slug
				? sprintf( /* translators: %s: tenant slug */ __( 'Connected to HIR tenant: %s', 'hir-connect' ), $slug )
				: __( 'Connection OK.', 'hir-connect' ),
		);
	}

	/**
	 * Submit a new order to HIR.
	 *
	 * @param array $payload Order payload.
	 * @return array|WP_Error Parsed response on success, WP_Error on failure.
	 */
	public function post_order( array $payload ) {
		if ( ! $this->plugin->is_enabled() ) {
			return new WP_Error( 'hir_disabled', __( 'HIR Connect is disabled.', 'hir-connect' ) );
		}

		$response = wp_remote_post(
			$this->url( '/api/public/v1/orders' ),
			array(
				'timeout'   => self::TIMEOUT_SECONDS,
				'headers'   => $this->headers(),
				'body'      => wp_json_encode( $payload ),
				'user-agent' => self::USER_AGENT,
			)
		);

		if ( is_wp_error( $response ) ) {
			error_log( 'HIR Connect: post_order transport error: ' . $response->get_error_message() );
			return $response;
		}

		$code = (int) wp_remote_retrieve_response_code( $response );
		$body = json_decode( wp_remote_retrieve_body( $response ), true );

		if ( $code < 200 || $code >= 300 ) {
			$msg = isset( $body['error'] ) ? (string) $body['error'] : sprintf( 'HTTP %d', $code );
			error_log( 'HIR Connect: post_order non-2xx: ' . $msg );
			return new WP_Error( 'hir_http_' . $code, $msg, $body );
		}

		return is_array( $body ) ? $body : array();
	}

	/**
	 * Notify HIR that an order's status has changed locally.
	 *
	 * @param string $hir_order_id HIR's order id.
	 * @param string $status       Local status name.
	 * @return array|WP_Error
	 */
	public function update_order_status( $hir_order_id, $status ) {
		if ( ! $this->plugin->is_enabled() ) {
			return new WP_Error( 'hir_disabled', __( 'HIR Connect is disabled.', 'hir-connect' ) );
		}

		$response = wp_remote_request(
			$this->url( '/api/public/v1/orders/' . rawurlencode( $hir_order_id ) . '/status' ),
			array(
				'method'    => 'PATCH',
				'timeout'   => self::TIMEOUT_SECONDS,
				'headers'   => $this->headers(),
				'body'      => wp_json_encode( array( 'status' => (string) $status ) ),
				'user-agent' => self::USER_AGENT,
			)
		);

		if ( is_wp_error( $response ) ) {
			return $response;
		}

		$code = (int) wp_remote_retrieve_response_code( $response );
		if ( $code < 200 || $code >= 300 ) {
			return new WP_Error( 'hir_http_' . $code, sprintf( 'HTTP %d', $code ) );
		}

		return json_decode( wp_remote_retrieve_body( $response ), true );
	}

	/**
	 * Get upsell suggestions for a given cart.
	 *
	 * @param array $cart_items Array of [{name, qty, unit_price_ron}].
	 * @return array<int,array<string,mixed>> List of suggestions (empty on failure).
	 */
	public function upsell_suggest( array $cart_items ) {
		if ( ! $this->plugin->is_enabled() ) {
			return array();
		}

		$response = wp_remote_post(
			$this->url( '/api/public/v1/upsell-suggest' ),
			array(
				'timeout'   => self::TIMEOUT_SECONDS,
				'headers'   => $this->headers(),
				'body'      => wp_json_encode( array( 'cart' => $cart_items ) ),
				'user-agent' => self::USER_AGENT,
			)
		);

		if ( is_wp_error( $response ) ) {
			return array();
		}

		$code = (int) wp_remote_retrieve_response_code( $response );
		if ( $code < 200 || $code >= 300 ) {
			return array();
		}

		$body = json_decode( wp_remote_retrieve_body( $response ), true );
		if ( ! is_array( $body ) || empty( $body['suggestions'] ) ) {
			return array();
		}

		return array_slice( (array) $body['suggestions'], 0, 3 );
	}
}
