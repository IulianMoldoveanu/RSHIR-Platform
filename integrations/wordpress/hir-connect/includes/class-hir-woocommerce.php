<?php
/**
 * WooCommerce integration.
 *
 * @package HIR_Connect
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class HIR_WooCommerce
 */
class HIR_WooCommerce {

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

		add_action( 'woocommerce_thankyou', array( $this, 'on_thankyou' ), 10, 1 );
		add_action( 'woocommerce_order_status_changed', array( $this, 'on_status_changed' ), 10, 4 );

		// Customer-facing tracking link.
		add_action( 'woocommerce_email_order_meta', array( $this, 'email_tracking_link' ), 10, 3 );
		add_action( 'woocommerce_view_order', array( $this, 'view_order_tracking' ), 5 );
		add_action( 'woocommerce_order_details_after_order_table', array( $this, 'view_order_tracking' ), 5 );
	}

	/**
	 * Fired on the thank-you page when a WC order completes checkout.
	 *
	 * @param int $order_id WC order id.
	 */
	public function on_thankyou( $order_id ) {
		if ( ! $this->plugin->is_enabled() || ! $order_id ) {
			return;
		}

		$order = wc_get_order( $order_id );
		if ( ! $order ) {
			return;
		}

		// Avoid double-submitting if we already have a HIR id.
		if ( $order->get_meta( '_hir_order_id' ) ) {
			return;
		}

		$payload  = $this->build_payload( $order );
		$response = $this->plugin->api->post_order( $payload );

		if ( is_wp_error( $response ) ) {
			$this->queue_retry( $payload, $order_id );
			$order->add_order_note(
				/* translators: %s: error message */
				sprintf( __( 'HIR Connect: order queued for retry — %s', 'hir-connect' ), $response->get_error_message() )
			);
			return;
		}

		$hir_id = isset( $response['order_id'] ) ? (string) $response['order_id'] : '';
		if ( '' !== $hir_id ) {
			$order->update_meta_data( '_hir_order_id', sanitize_text_field( $hir_id ) );
		}
		if ( ! empty( $response['tracking_url'] ) ) {
			$order->update_meta_data( '_hir_tracking_url', esc_url_raw( (string) $response['tracking_url'] ) );
		}
		if ( isset( $response['eta_minutes'] ) ) {
			$order->update_meta_data( '_hir_eta_minutes', (int) $response['eta_minutes'] );
		}
		$order->add_order_note(
			/* translators: %s: HIR order id */
			sprintf( __( 'HIR Connect: sent to HIR (id %s).', 'hir-connect' ), $hir_id ? $hir_id : 'n/a' )
		);
		$order->save();
	}

	/**
	 * Push status changes back to HIR.
	 *
	 * @param int      $order_id  Order id.
	 * @param string   $old       Previous status.
	 * @param string   $new       New status.
	 * @param WC_Order $order     Order object.
	 */
	public function on_status_changed( $order_id, $old, $new, $order ) {
		if ( ! $this->plugin->is_enabled() ) {
			return;
		}
		if ( ! $order instanceof WC_Order ) {
			return;
		}

		$hir_id = (string) $order->get_meta( '_hir_order_id' );
		if ( '' === $hir_id ) {
			// Not a HIR-managed order yet; thank-you hook will handle it.
			return;
		}

		$response = $this->plugin->api->update_order_status( $hir_id, (string) $new );
		if ( is_wp_error( $response ) ) {
			error_log( 'HIR Connect: status push failed for order ' . $order_id . ': ' . $response->get_error_message() );
		}
	}

	/**
	 * Append tracking link to customer email.
	 *
	 * @param WC_Order $order        Order.
	 * @param bool     $sent_to_admin Sent to admin?
	 * @param bool     $plain_text    Plain text?
	 */
	public function email_tracking_link( $order, $sent_to_admin, $plain_text ) {
		if ( $sent_to_admin || ! $order instanceof WC_Order ) {
			return;
		}
		$url = (string) $order->get_meta( '_hir_tracking_url' );
		if ( '' === $url ) {
			return;
		}
		if ( $plain_text ) {
			echo "\n" . esc_html__( 'Track your delivery:', 'hir-connect' ) . ' ' . esc_url( $url ) . "\n";
		} else {
			echo '<p><strong>' . esc_html__( 'Track your delivery:', 'hir-connect' ) . '</strong> ';
			echo '<a href="' . esc_url( $url ) . '">' . esc_html( $url ) . '</a></p>';
		}
	}

	/**
	 * Show tracking link on My Account -> Orders detail.
	 *
	 * @param WC_Order|int $order Order or id.
	 */
	public function view_order_tracking( $order ) {
		if ( ! $order instanceof WC_Order ) {
			$order = wc_get_order( (int) $order );
		}
		if ( ! $order ) {
			return;
		}
		$url = (string) $order->get_meta( '_hir_tracking_url' );
		if ( '' === $url ) {
			return;
		}
		$eta = (int) $order->get_meta( '_hir_eta_minutes' );
		echo '<section class="hir-tracking-card">';
		echo '<h2>' . esc_html__( 'Delivery tracking', 'hir-connect' ) . '</h2>';
		if ( $eta > 0 ) {
			echo '<p>' . sprintf(
				/* translators: %d: minutes */
				esc_html__( 'Estimated arrival: %d minutes', 'hir-connect' ),
				$eta
			) . '</p>';
		}
		echo '<p><a class="button" href="' . esc_url( $url ) . '">' . esc_html__( 'Open live tracking', 'hir-connect' ) . '</a></p>';
		echo '</section>';
	}

	/**
	 * Build the HIR order payload from a WC order.
	 *
	 * @param WC_Order $order Order.
	 * @return array
	 */
	private function build_payload( WC_Order $order ) {
		// Shape MUST match the HIR public API zod schema at
		// POST /api/public/v1/orders (apps/restaurant-web .../public/v1/orders):
		//   customer.firstName (required, non-empty), items[].priceRon,
		//   totals{subtotalRon,deliveryFeeRon,totalRon}, fulfillment, dropoff.
		// Sending the legacy {name,total_ron,delivery_address,unit_price_ron}
		// shape is rejected with 400 invalid_request.
		$items = array();
		foreach ( $order->get_items() as $item ) {
			if ( ! $item instanceof WC_Order_Item_Product ) {
				continue;
			}
			$qty        = max( 1, (int) $item->get_quantity() );
			$unit_price = round( (float) $item->get_total() / $qty, 2 );
			$items[]    = array(
				'name'     => $item->get_name(),
				'qty'      => $qty,
				'priceRon' => $unit_price,
			);
		}

		// HIR requires a non-empty firstName. WooCommerce stores first/last
		// separately; if first is blank, promote the last name, then fall
		// back to a generic label so a nameless guest order still posts.
		$first = trim( (string) $order->get_billing_first_name() );
		$last  = trim( (string) $order->get_billing_last_name() );
		if ( '' === $first && '' === $last ) {
			$first = __( 'Client', 'hir-connect' );
		} elseif ( '' === $first ) {
			$first = $last;
			$last  = '';
		}

		$line1 = $order->get_shipping_address_1() ? $order->get_shipping_address_1() : $order->get_billing_address_1();
		$line2 = $order->get_shipping_address_2() ? $order->get_shipping_address_2() : $order->get_billing_address_2();
		$city  = $order->get_shipping_city() ? $order->get_shipping_city() : $order->get_billing_city();

		// API caps notes at 500 chars; truncate to avoid a 400 on long notes.
		$notes = (string) $order->get_customer_note();
		if ( function_exists( 'mb_substr' ) ) {
			$notes = mb_substr( $notes, 0, 500 );
		} else {
			$notes = substr( $notes, 0, 500 );
		}

		return array(
			// external_order_id + source are ignored by the API today but kept
			// for forward-compat / server-side correlation logging.
			'external_order_id' => (int) $order->get_id(),
			'customer'          => array(
				'firstName' => $first,
				'lastName'  => $last,
				'phone'     => (string) $order->get_billing_phone(),
				'email'     => (string) $order->get_billing_email(),
			),
			'items'             => $items,
			'totals'            => array(
				'subtotalRon'    => round( (float) $order->get_subtotal(), 2 ),
				'deliveryFeeRon' => round( (float) $order->get_shipping_total(), 2 ),
				'totalRon'       => round( (float) $order->get_total(), 2 ),
			),
			'fulfillment'       => 'DELIVERY',
			'dropoff'           => array(
				'line1' => (string) $line1,
				'line2' => (string) $line2,
				'city'  => (string) $city,
			),
			'notes'             => $notes,
			'source'            => 'woocommerce',
		);
	}

	/**
	 * Queue a payload for cron retry.
	 *
	 * @param array $payload  Payload.
	 * @param int   $order_id WC order id (for meta updates after retry).
	 */
	private function queue_retry( array $payload, $order_id ) {
		$queue = (array) get_option( 'hir_connect_retry_queue', array() );
		$queue[] = array(
			'payload'     => $payload,
			'wc_order_id' => (int) $order_id,
			'queued_at'   => time(),
			'attempts'    => 0,
		);
		update_option( 'hir_connect_retry_queue', $queue, false );

		if ( ! wp_next_scheduled( HIR_Connect::CRON_RETRY_HOOK ) ) {
			wp_schedule_single_event( time() + 300, HIR_Connect::CRON_RETRY_HOOK );
		}
	}
}
