/* HIR Connect — admin page UX */
(function ($) {
	'use strict';

	$(function () {
		// Toggle API key visibility.
		$('#hir-toggle-key').on('click', function () {
			var $field = $('#hir_api_key');
			var type = $field.attr('type') === 'password' ? 'text' : 'password';
			$field.attr('type', type);
			$(this).text(type === 'password' ? 'Show' : 'Hide');
		});

		// Copy webhook URL to clipboard.
		$('[data-hir-copy]').on('click', function () {
			var text = $(this).data('hir-copy');
			if (!navigator.clipboard) {
				return;
			}
			var $btn = $(this);
			var original = $btn.text();
			navigator.clipboard.writeText(text).then(function () {
				$btn.text('Copied!');
				setTimeout(function () {
					$btn.text(original);
				}, 1500);
			});
		});
	});
})(jQuery);
