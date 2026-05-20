<?php
/**
 * Elementor Pro Forms integration.
 *
 * Registers a custom Form Action: "Send to HIR Connect" — maps form
 * fields to a HIR order payload. Useful for sites without WooCommerce
 * (e.g. deliveryhouse.ro uses Elementor + Kadence).
 *
 * @package HIR_Connect
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class HIR_Elementor
 */
class HIR_Elementor {

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
		add_action( 'elementor_pro/forms/actions/register', array( $this, 'register_action' ) );
	}

	/**
	 * Register the form action with Elementor.
	 *
	 * @param object $form_actions_registrar Elementor form actions registrar.
	 */
	public function register_action( $form_actions_registrar ) {
		// Action class extends Elementor base — only safe to load now.
		if ( ! class_exists( 'ElementorPro\Modules\Forms\Classes\Action_Base' ) ) {
			return;
		}
		require_once HIR_CONNECT_PLUGIN_DIR . 'includes/class-hir-elementor-action.php';
		if ( class_exists( 'HIR_Elementor_Action' ) ) {
			$form_actions_registrar->register( new HIR_Elementor_Action( $this->plugin ) );
		}
	}
}
