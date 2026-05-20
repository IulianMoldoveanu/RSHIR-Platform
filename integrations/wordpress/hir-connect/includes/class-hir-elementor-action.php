<?php
/**
 * Elementor Pro Form Action: Send to HIR Connect.
 *
 * @package HIR_Connect
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

// Defensive: only declare the class if the base exists (Elementor Pro active).
if ( ! class_exists( 'ElementorPro\Modules\Forms\Classes\Action_Base' ) ) {
	return;
}

/**
 * Class HIR_Elementor_Action
 *
 * Implements an Elementor form action that maps form fields onto a HIR
 * order payload. The site owner picks which form field IDs map to which
 * HIR fields via the action's settings panel.
 */
class HIR_Elementor_Action extends \ElementorPro\Modules\Forms\Classes\Action_Base {

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
	 * Action name (internal id).
	 *
	 * @return string
	 */
	public function get_name() {
		return 'hir_connect';
	}

	/**
	 * Action label shown in the form editor.
	 *
	 * @return string
	 */
	public function get_label() {
		return __( 'Send to HIR Connect', 'hir-connect' );
	}

	/**
	 * Register settings controls on the form editor sidebar.
	 *
	 * @param \Elementor\Widget_Base $widget The form widget.
	 */
	public function register_settings_section( $widget ) {
		$widget->start_controls_section(
			'section_hir_connect',
			array(
				'label'     => __( 'HIR Connect', 'hir-connect' ),
				'condition' => array( 'submit_actions' => 'hir_connect' ),
			)
		);

		$widget->add_control(
			'hir_field_name',
			array(
				'label'       => __( 'Customer name field ID', 'hir-connect' ),
				'type'        => \Elementor\Controls_Manager::TEXT,
				'default'     => 'name',
				'description' => __( 'The form field ID that contains the customer name.', 'hir-connect' ),
			)
		);
		$widget->add_control(
			'hir_field_phone',
			array(
				'label'   => __( 'Phone field ID', 'hir-connect' ),
				'type'    => \Elementor\Controls_Manager::TEXT,
				'default' => 'phone',
			)
		);
		$widget->add_control(
			'hir_field_email',
			array(
				'label'   => __( 'Email field ID', 'hir-connect' ),
				'type'    => \Elementor\Controls_Manager::TEXT,
				'default' => 'email',
			)
		);
		$widget->add_control(
			'hir_field_address',
			array(
				'label'   => __( 'Delivery address field ID', 'hir-connect' ),
				'type'    => \Elementor\Controls_Manager::TEXT,
				'default' => 'address',
			)
		);
		$widget->add_control(
			'hir_field_city',
			array(
				'label'   => __( 'City field ID', 'hir-connect' ),
				'type'    => \Elementor\Controls_Manager::TEXT,
				'default' => 'city',
			)
		);
		$widget->add_control(
			'hir_field_items',
			array(
				'label'       => __( 'Items (free text) field ID', 'hir-connect' ),
				'type'        => \Elementor\Controls_Manager::TEXT,
				'default'     => 'items',
				'description' => __( 'A textarea where customer types what they want, or a hidden field built from cart items.', 'hir-connect' ),
			)
		);
		$widget->add_control(
			'hir_field_total',
			array(
				'label'       => __( 'Total RON field ID', 'hir-connect' ),
				'type'        => \Elementor\Controls_Manager::TEXT,
				'default'     => 'total',
				'description' => __( 'Numeric total in lei. Optional — set 0 if unknown.', 'hir-connect' ),
			)
		);
		$widget->add_control(
			'hir_field_notes',
			array(
				'label'   => __( 'Notes field ID', 'hir-connect' ),
				'type'    => \Elementor\Controls_Manager::TEXT,
				'default' => 'notes',
			)
		);

		$widget->end_controls_section();
	}

	/**
	 * Run the action when the form is submitted.
	 *
	 * @param \ElementorPro\Modules\Forms\Classes\Form_Record  $record       Submitted record.
	 * @param \ElementorPro\Modules\Forms\Classes\Ajax_Handler $ajax_handler AJAX handler.
	 */
	public function run( $record, $ajax_handler ) {
		if ( ! $this->plugin->is_enabled() ) {
			return;
		}

		$settings = $record->get( 'form_settings' );
		$fields   = $record->get( 'fields' );

		$pick = function ( $key ) use ( $settings, $fields ) {
			$field_id = isset( $settings[ $key ] ) ? (string) $settings[ $key ] : '';
			if ( '' === $field_id || empty( $fields[ $field_id ] ) ) {
				return '';
			}
			return (string) $fields[ $field_id ]['value'];
		};

		$total = (float) preg_replace( '/[^0-9.]/', '', $pick( 'hir_field_total' ) );
		$items_raw = $pick( 'hir_field_items' );

		$payload = array(
			'external_order_id' => 'el-' . wp_generate_password( 8, false, false ),
			'customer'          => array(
				'name'  => sanitize_text_field( $pick( 'hir_field_name' ) ),
				'phone' => sanitize_text_field( $pick( 'hir_field_phone' ) ),
				'email' => sanitize_email( $pick( 'hir_field_email' ) ),
			),
			'delivery_address'  => array(
				'line1' => sanitize_text_field( $pick( 'hir_field_address' ) ),
				'city'  => sanitize_text_field( $pick( 'hir_field_city' ) ),
			),
			'items'             => array(
				array(
					'name'           => 'Order (free text)',
					'qty'            => 1,
					'unit_price_ron' => $total,
					'notes'          => sanitize_textarea_field( $items_raw ),
				),
			),
			'total_ron'         => $total,
			'currency'          => 'RON',
			'notes'             => sanitize_textarea_field( $pick( 'hir_field_notes' ) ),
			'payment_status'    => 'UNPAID',
			'source'            => 'elementor-form',
		);

		$response = $this->plugin->api->post_order( $payload );
		if ( is_wp_error( $response ) ) {
			$ajax_handler->add_error_message(
				__( 'HIR Connect: could not register the order. We saved it and will retry shortly.', 'hir-connect' )
			);
			// Queue retry.
			$queue   = (array) get_option( 'hir_connect_retry_queue', array() );
			$queue[] = array(
				'payload'   => $payload,
				'queued_at' => time(),
				'attempts'  => 0,
			);
			update_option( 'hir_connect_retry_queue', $queue, false );
			return;
		}

		if ( ! empty( $response['tracking_url'] ) ) {
			$ajax_handler->add_response_data(
				'hir_tracking_url',
				esc_url_raw( (string) $response['tracking_url'] )
			);
		}
	}

	/**
	 * Required by base class but unused.
	 *
	 * @param array $element Element data.
	 */
	public function on_export( $element ) {
		return $element;
	}
}
