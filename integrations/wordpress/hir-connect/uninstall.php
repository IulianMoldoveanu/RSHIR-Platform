<?php
/**
 * Uninstall — wipe plugin data on removal.
 *
 * @package HIR_Connect
 */

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

delete_option( 'hir_connect_options' );
delete_option( 'hir_connect_retry_queue' );

// Best-effort transient cleanup (idempotency keys).
global $wpdb;
$wpdb->query( "DELETE FROM {$wpdb->options} WHERE option_name LIKE '_transient_hir_wh_%' OR option_name LIKE '_transient_timeout_hir_wh_%'" );

// Unschedule cron.
$timestamp = wp_next_scheduled( 'hir_connect_retry_queue' );
if ( $timestamp ) {
	wp_unschedule_event( $timestamp, 'hir_connect_retry_queue' );
}
