<?php
/**
 * Settings page: Settings -> HIR Connect.
 *
 * @package HIR_Connect
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class HIR_Settings
 */
class HIR_Settings {

	const NONCE_ACTION = 'hir_connect_save';
	const TEST_ACTION  = 'hir_connect_test';
	const PAGE_SLUG    = 'hir-connect';

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
		add_action( 'admin_menu', array( $this, 'add_menu' ) );
		add_action( 'admin_post_hir_connect_save', array( $this, 'handle_save' ) );
		add_action( 'admin_post_hir_connect_test', array( $this, 'handle_test' ) );
		add_action( 'admin_enqueue_scripts', array( $this, 'enqueue' ) );
		add_filter( 'plugin_action_links_' . HIR_CONNECT_PLUGIN_BASENAME, array( $this, 'action_links' ) );
	}

	/**
	 * Add Settings -> HIR Connect submenu.
	 */
	public function add_menu() {
		add_options_page(
			__( 'HIR Connect', 'hir-connect' ),
			__( 'HIR Connect', 'hir-connect' ),
			'manage_options',
			self::PAGE_SLUG,
			array( $this, 'render_page' )
		);
	}

	/**
	 * Add a Settings link on the plugins list row.
	 *
	 * @param array $links Existing links.
	 * @return array
	 */
	public function action_links( $links ) {
		$url             = admin_url( 'options-general.php?page=' . self::PAGE_SLUG );
		$links['settings'] = '<a href="' . esc_url( $url ) . '">' . esc_html__( 'Settings', 'hir-connect' ) . '</a>';
		return $links;
	}

	/**
	 * Enqueue admin assets only on our page.
	 *
	 * @param string $hook Hook suffix.
	 */
	public function enqueue( $hook ) {
		if ( 'settings_page_' . self::PAGE_SLUG !== $hook ) {
			return;
		}
		wp_enqueue_style(
			'hir-connect-admin',
			HIR_CONNECT_PLUGIN_URL . 'assets/css/admin.css',
			array(),
			HIR_CONNECT_VERSION
		);
		wp_enqueue_script(
			'hir-connect-admin',
			HIR_CONNECT_PLUGIN_URL . 'assets/js/admin.js',
			array( 'jquery' ),
			HIR_CONNECT_VERSION,
			true
		);
	}

	/**
	 * Render the settings page.
	 */
	public function render_page() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission.', 'hir-connect' ) );
		}

		$opts    = (array) get_option( HIR_Connect::OPTION_KEY, array() );
		$flash   = isset( $_GET['hir_msg'] ) ? sanitize_key( wp_unslash( $_GET['hir_msg'] ) ) : '';
		$flash_t = isset( $_GET['hir_text'] ) ? sanitize_text_field( wp_unslash( $_GET['hir_text'] ) ) : '';

		$endpoint    = isset( $opts['endpoint'] ) ? $opts['endpoint'] : HIR_CONNECT_DEFAULT_ENDPOINT;
		$api_key     = isset( $opts['api_key'] ) ? $opts['api_key'] : '';
		$tenant      = isset( $opts['tenant_slug'] ) ? $opts['tenant_slug'] : '';
		$secret      = isset( $opts['webhook_secret'] ) ? $opts['webhook_secret'] : '';
		$enabled     = isset( $opts['enabled'] ) ? (string) $opts['enabled'] : '1';
		$show_upsell = isset( $opts['show_upsell'] ) ? (string) $opts['show_upsell'] : '1';

		$webhook_url = $this->plugin->webhook->get_public_url();

		?>
		<div class="wrap hir-connect-wrap">
			<h1><?php esc_html_e( 'HIR Connect', 'hir-connect' ); ?></h1>
			<p class="description">
				<?php esc_html_e( 'Connect this site to HIR for last-mile delivery, AI agents, and tracking.', 'hir-connect' ); ?>
			</p>

			<?php if ( 'saved' === $flash ) : ?>
				<div class="notice notice-success is-dismissible"><p><?php esc_html_e( 'Settings saved.', 'hir-connect' ); ?></p></div>
			<?php elseif ( 'tested_ok' === $flash ) : ?>
				<div class="notice notice-success is-dismissible"><p><?php echo esc_html( $flash_t ? $flash_t : __( 'Connection OK.', 'hir-connect' ) ); ?></p></div>
			<?php elseif ( 'tested_fail' === $flash ) : ?>
				<div class="notice notice-error is-dismissible"><p><?php echo esc_html( $flash_t ? $flash_t : __( 'Connection failed.', 'hir-connect' ) ); ?></p></div>
			<?php endif; ?>

			<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" class="hir-connect-form">
				<input type="hidden" name="action" value="hir_connect_save" />
				<?php wp_nonce_field( self::NONCE_ACTION ); ?>

				<table class="form-table" role="presentation">
					<tr>
						<th scope="row"><label for="hir_endpoint"><?php esc_html_e( 'HIR API endpoint', 'hir-connect' ); ?></label></th>
						<td>
							<input type="url" name="hir_endpoint" id="hir_endpoint" class="regular-text"
								value="<?php echo esc_attr( $endpoint ); ?>" placeholder="<?php echo esc_attr( HIR_CONNECT_DEFAULT_ENDPOINT ); ?>" />
							<p class="description"><?php esc_html_e( 'Production: https://hirforyou.ro', 'hir-connect' ); ?></p>
						</td>
					</tr>
					<tr>
						<th scope="row"><label for="hir_api_key"><?php esc_html_e( 'API key', 'hir-connect' ); ?></label></th>
						<td>
							<input type="password" name="hir_api_key" id="hir_api_key" class="regular-text"
								value="<?php echo esc_attr( $api_key ); ?>" autocomplete="off" />
							<button type="button" class="button" id="hir-toggle-key"><?php esc_html_e( 'Show', 'hir-connect' ); ?></button>
							<p class="description"><?php esc_html_e( 'Paste the key you received during HIR onboarding.', 'hir-connect' ); ?></p>
						</td>
					</tr>
					<tr>
						<th scope="row"><?php esc_html_e( 'Tenant slug', 'hir-connect' ); ?></th>
						<td>
							<code id="hir-tenant"><?php echo $tenant ? esc_html( $tenant ) : esc_html__( '— (auto-detected on first test)', 'hir-connect' ); ?></code>
						</td>
					</tr>
					<tr>
						<th scope="row"><?php esc_html_e( 'Webhook receiver URL', 'hir-connect' ); ?></th>
						<td>
							<code class="hir-mono"><?php echo esc_html( $webhook_url ); ?></code>
							<button type="button" class="button" data-hir-copy="<?php echo esc_attr( $webhook_url ); ?>">
								<?php esc_html_e( 'Copy', 'hir-connect' ); ?>
							</button>
							<p class="description"><?php esc_html_e( 'Give this URL to HIR onboarding so HIR can push status updates.', 'hir-connect' ); ?></p>
						</td>
					</tr>
					<tr>
						<th scope="row"><label for="hir_webhook_secret"><?php esc_html_e( 'Webhook signing secret', 'hir-connect' ); ?></label></th>
						<td>
							<input type="password" name="hir_webhook_secret" id="hir_webhook_secret" class="regular-text"
								value="<?php echo esc_attr( $secret ); ?>" autocomplete="off" />
							<p class="description"><?php esc_html_e( 'Shared secret used to verify HMAC-SHA256 signatures on incoming webhooks.', 'hir-connect' ); ?></p>
						</td>
					</tr>
					<tr>
						<th scope="row"><?php esc_html_e( 'Enable HIR delivery', 'hir-connect' ); ?></th>
						<td>
							<label>
								<input type="checkbox" name="hir_enabled" value="1" <?php checked( '1', $enabled ); ?> />
								<?php esc_html_e( 'Master switch — when off, no orders are sent and no webhooks are accepted by WooCommerce.', 'hir-connect' ); ?>
							</label>
						</td>
					</tr>
					<tr>
						<th scope="row"><?php esc_html_e( 'Upsell suggestions', 'hir-connect' ); ?></th>
						<td>
							<label>
								<input type="checkbox" name="hir_show_upsell" value="1" <?php checked( '1', $show_upsell ); ?> />
								<?php esc_html_e( 'Show 3 AI cross-sell items on checkout (requires [hir_upsell] shortcode or widget placement).', 'hir-connect' ); ?>
							</label>
						</td>
					</tr>
				</table>

				<?php submit_button( __( 'Save changes', 'hir-connect' ) ); ?>
			</form>

			<hr />

			<h2><?php esc_html_e( 'Test connection', 'hir-connect' ); ?></h2>
			<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" class="hir-connect-test">
				<input type="hidden" name="action" value="hir_connect_test" />
				<?php wp_nonce_field( self::TEST_ACTION ); ?>
				<p>
					<button type="submit" class="button button-secondary">
						<?php esc_html_e( 'Ping HIR API', 'hir-connect' ); ?>
					</button>
					<span class="description">
						<?php esc_html_e( 'Verifies the API key by calling /api/public/v1/ping.', 'hir-connect' ); ?>
					</span>
				</p>
			</form>

			<hr />

			<h2><?php esc_html_e( 'Integration hints', 'hir-connect' ); ?></h2>
			<ul class="hir-hints">
				<li>
					<strong><?php esc_html_e( 'WooCommerce:', 'hir-connect' ); ?></strong>
					<?php
					echo class_exists( 'WooCommerce' )
						? esc_html__( 'detected — orders auto-sync on thank-you page.', 'hir-connect' )
						: esc_html__( 'not detected — install WooCommerce to enable order sync, or use Elementor Pro forms.', 'hir-connect' );
					?>
				</li>
				<li>
					<strong><?php esc_html_e( 'Elementor Pro Forms:', 'hir-connect' ); ?></strong>
					<?php
					echo class_exists( 'ElementorPro\Plugin' )
						? esc_html__( 'detected — choose "Send to HIR Connect" as a form action.', 'hir-connect' )
						: esc_html__( 'not detected — install Elementor Pro to capture orders via forms.', 'hir-connect' );
					?>
				</li>
				<li>
					<strong><?php esc_html_e( 'Shortcodes:', 'hir-connect' ); ?></strong>
					<code>[hir_upsell]</code>, <code>[hir_tracking order_id="..."]</code>
				</li>
			</ul>
		</div>
		<?php
	}

	/**
	 * Save settings.
	 */
	public function handle_save() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission.', 'hir-connect' ) );
		}
		check_admin_referer( self::NONCE_ACTION );

		$opts                   = (array) get_option( HIR_Connect::OPTION_KEY, array() );
		$opts['endpoint']       = isset( $_POST['hir_endpoint'] ) ? esc_url_raw( wp_unslash( $_POST['hir_endpoint'] ) ) : HIR_CONNECT_DEFAULT_ENDPOINT;
		$opts['api_key']        = isset( $_POST['hir_api_key'] ) ? sanitize_text_field( wp_unslash( $_POST['hir_api_key'] ) ) : '';
		$opts['webhook_secret'] = isset( $_POST['hir_webhook_secret'] ) ? sanitize_text_field( wp_unslash( $_POST['hir_webhook_secret'] ) ) : '';
		$opts['enabled']        = ! empty( $_POST['hir_enabled'] ) ? '1' : '0';
		$opts['show_upsell']    = ! empty( $_POST['hir_show_upsell'] ) ? '1' : '0';

		// Don't allow client-side override of tenant_slug — only API can set it.
		if ( ! isset( $opts['tenant_slug'] ) ) {
			$opts['tenant_slug'] = '';
		}

		update_option( HIR_Connect::OPTION_KEY, $opts );

		wp_safe_redirect( add_query_arg(
			array( 'page' => self::PAGE_SLUG, 'hir_msg' => 'saved' ),
			admin_url( 'options-general.php' )
		) );
		exit;
	}

	/**
	 * Test connection.
	 */
	public function handle_test() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission.', 'hir-connect' ) );
		}
		check_admin_referer( self::TEST_ACTION );

		$result = $this->plugin->api->ping();
		$flag   = ! empty( $result['ok'] ) ? 'tested_ok' : 'tested_fail';
		$msg    = isset( $result['message'] ) ? (string) $result['message'] : '';

		wp_safe_redirect( add_query_arg(
			array(
				'page'     => self::PAGE_SLUG,
				'hir_msg'  => $flag,
				'hir_text' => rawurlencode( $msg ),
			),
			admin_url( 'options-general.php' )
		) );
		exit;
	}
}
