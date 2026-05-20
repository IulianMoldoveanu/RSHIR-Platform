<?php
/**
 * Upsell widget — shortcode + Elementor widget.
 *
 * @package HIR_Connect
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class HIR_Upsell
 */
class HIR_Upsell {

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
		add_shortcode( 'hir_upsell', array( $this, 'shortcode' ) );
		add_action( 'wp_enqueue_scripts', array( $this, 'enqueue' ) );
		// Add-to-cart endpoint for AJAX.
		add_action( 'rest_api_init', array( $this, 'register_rest' ) );
	}

	/**
	 * Enqueue assets only when shortcode is on the page.
	 */
	public function enqueue() {
		// Cheap heuristic: register the CSS but rely on shortcode call to print it.
		wp_register_style(
			'hir-connect-upsell',
			HIR_CONNECT_PLUGIN_URL . 'assets/css/admin.css',
			array(),
			HIR_CONNECT_VERSION
		);
	}

	/**
	 * Register REST route for "Add to cart" buttons.
	 */
	public function register_rest() {
		register_rest_route(
			'hir-connect/v1',
			'/upsell-add',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'rest_add_to_cart' ),
				'permission_callback' => '__return_true',
			)
		);
	}

	/**
	 * REST callback to add an item to the WC cart.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public function rest_add_to_cart( WP_REST_Request $request ) {
		$product_id = (int) $request->get_param( 'product_id' );
		if ( ! class_exists( 'WooCommerce' ) || ! function_exists( 'WC' ) ) {
			return new WP_REST_Response( array( 'error' => 'wc_inactive' ), 400 );
		}
		if ( $product_id <= 0 ) {
			return new WP_REST_Response( array( 'error' => 'bad_product' ), 400 );
		}

		$cart = WC()->cart;
		if ( ! $cart ) {
			return new WP_REST_Response( array( 'error' => 'no_cart' ), 400 );
		}
		$ok = $cart->add_to_cart( $product_id, 1 );
		if ( ! $ok ) {
			return new WP_REST_Response( array( 'error' => 'add_failed' ), 400 );
		}
		return new WP_REST_Response( array( 'ok' => true, 'count' => $cart->get_cart_contents_count() ), 200 );
	}

	/**
	 * Shortcode renderer for [hir_upsell].
	 *
	 * @param array $atts Attributes.
	 * @return string
	 */
	public function shortcode( $atts ) {
		if ( ! $this->plugin->is_enabled() || '1' !== (string) $this->plugin->get_option( 'show_upsell', '1' ) ) {
			return '';
		}

		$atts = shortcode_atts(
			array(
				'title' => __( 'You might also like', 'hir-connect' ),
			),
			$atts,
			'hir_upsell'
		);

		$cart_items = $this->build_cart_snapshot();
		$suggestions = $this->plugin->api->upsell_suggest( $cart_items );
		if ( empty( $suggestions ) ) {
			return '';
		}

		wp_enqueue_style( 'hir-connect-upsell' );

		ob_start();
		?>
		<div class="hir-upsell" role="region" aria-label="<?php echo esc_attr( $atts['title'] ); ?>">
			<h3 class="hir-upsell__title"><?php echo esc_html( $atts['title'] ); ?></h3>
			<ul class="hir-upsell__list">
				<?php foreach ( $suggestions as $s ) :
					$name  = isset( $s['name'] ) ? (string) $s['name'] : '';
					$price = isset( $s['price_ron'] ) ? (float) $s['price_ron'] : 0.0;
					$img   = isset( $s['image_url'] ) ? (string) $s['image_url'] : '';
					$pid   = isset( $s['wc_product_id'] ) ? (int) $s['wc_product_id'] : 0;
				?>
					<li class="hir-upsell__item">
						<?php if ( $img ) : ?>
							<img class="hir-upsell__img" src="<?php echo esc_url( $img ); ?>" alt="" loading="lazy" />
						<?php endif; ?>
						<div class="hir-upsell__name"><?php echo esc_html( $name ); ?></div>
						<div class="hir-upsell__price">
							<?php echo esc_html( number_format_i18n( $price, 2 ) ); ?> <?php esc_html_e( 'lei', 'hir-connect' ); ?>
						</div>
						<?php if ( $pid > 0 && class_exists( 'WooCommerce' ) ) : ?>
							<button class="hir-upsell__add button"
								data-hir-upsell-add="<?php echo esc_attr( $pid ); ?>">
								<?php esc_html_e( 'Add to cart', 'hir-connect' ); ?>
							</button>
						<?php endif; ?>
					</li>
				<?php endforeach; ?>
			</ul>
		</div>
		<script>
		(function(){
			var nodes = document.querySelectorAll('[data-hir-upsell-add]');
			nodes.forEach(function(btn){
				btn.addEventListener('click', function(){
					var pid = btn.getAttribute('data-hir-upsell-add');
					btn.disabled = true;
					fetch('<?php echo esc_url_raw( rest_url( 'hir-connect/v1/upsell-add' ) ); ?>', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ product_id: parseInt(pid, 10) })
					}).then(function(r){ return r.json(); }).then(function(){
						btn.textContent = '<?php echo esc_js( __( 'Added', 'hir-connect' ) ); ?>';
					}).catch(function(){
						btn.disabled = false;
					});
				});
			});
		})();
		</script>
		<?php
		return (string) ob_get_clean();
	}

	/**
	 * Snapshot WC cart for upsell-suggest API.
	 *
	 * @return array
	 */
	private function build_cart_snapshot() {
		if ( ! class_exists( 'WooCommerce' ) || ! function_exists( 'WC' ) ) {
			return array();
		}
		$cart = WC()->cart;
		if ( ! $cart ) {
			return array();
		}

		$items = array();
		foreach ( $cart->get_cart() as $row ) {
			$product = isset( $row['data'] ) ? $row['data'] : null;
			if ( ! $product instanceof WC_Product ) {
				continue;
			}
			$qty = isset( $row['quantity'] ) ? (int) $row['quantity'] : 1;
			$items[] = array(
				'name'           => $product->get_name(),
				'qty'            => $qty,
				'unit_price_ron' => (float) $product->get_price(),
				'wc_product_id'  => (int) $product->get_id(),
			);
		}
		return $items;
	}
}
