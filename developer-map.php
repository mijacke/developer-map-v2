<?php
/**
 * Plugin Name: Developer Map by FuuDobre
 * Description: Administrátorský dashboard pre vytváranie interaktívnych máp a lokalít a ich zobrazenie na vašom webe.
 * Version: 0.4.4
 * Author: Mario
 */

if (!defined('ABSPATH')) {
    exit;
}

require_once plugin_dir_path(__FILE__) . 'includes/class-dm-storage.php';
require_once plugin_dir_path(__FILE__) . 'includes/class-dm-rest-controller.php';

/**
 * Handle POST requests made from the admin screen.
 */
function dm_handle_admin_post(): void
{
    if (defined('DOING_AJAX') && DOING_AJAX) {
        return;
    }

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        return;
    }

    if (!isset($_POST['dm_admin_action'])) {
        return;
    }

    if (!current_user_can(DM_SETTINGS_CAPABILITY)) {
        wp_die(
            esc_html__('You are not allowed to perform this action.', 'developer-map'),
            esc_html__('Access denied', 'developer-map'),
            ['response' => 403]
        );
    }

    check_admin_referer('dm_admin_save', 'dm_admin_nonce');

    $action = sanitize_text_field(wp_unslash($_POST['dm_admin_action']));

    /**
     * Allow other parts of the plugin to handle admin actions.
     *
     * @param string $action Sanitized action identifier.
     * @param array  $data   Raw post data.
     */
    do_action('dm_admin_handle_action', $action, $_POST);
}
add_action('admin_init', 'dm_handle_admin_post');

add_action('rest_api_init', function (): void {
    DM_Rest_Controller::register_routes();
});

/**
 * AJAX handler to keep the admin UI responsive.
 */
function dm_handle_ajax_ping(): void
{
    if (!current_user_can(DM_SETTINGS_CAPABILITY)) {
        wp_send_json_error(
            ['message' => esc_html__('You are not allowed to access this resource.', 'developer-map')],
            403
        );
    }

    check_ajax_referer(DM_NONCE_ACTION_AJAX, 'nonce');

    wp_send_json_success([
        'ok' => true,
        'ts' => time(),
    ]);
}
add_action('wp_ajax_dm_ping', 'dm_handle_ajax_ping');

define('DM_PLUGIN_VERSION', '0.4.4');
define('DM_DEV_PAGE_SLUG', 'devtest-9kq7wza3');
define('DM_PLUGIN_STYLE_HANDLE', 'developer-map-style');
define('DM_PLUGIN_SCRIPT_HANDLE', 'developer-map-script');
define('DM_NONCE_ACTION_AJAX', 'dm_admin_ajax');

if (!defined('DM_SETTINGS_CAPABILITY')) {
    define('DM_SETTINGS_CAPABILITY', 'manage_options');
}

if (!defined('DM_ENABLE_SHORTCODE_COMPAT')) {
    define('DM_ENABLE_SHORTCODE_COMPAT', true);
}

/**
 * Build a cache-busting version that bumps whenever any asset changes.
 */
function dm_get_assets_version(): string
{
    static $version = null;

    if ($version !== null) {
        return $version;
    }

    $base_path = plugin_dir_path(__FILE__) . 'public/assets/';
    $latest_mtime = 0;

    if (is_dir($base_path)) {
        $flags = FilesystemIterator::SKIP_DOTS;
        $iterator = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($base_path, $flags)
        );

        foreach ($iterator as $file) {
            if (!$file instanceof SplFileInfo || !$file->isFile()) {
                continue;
            }

            $ext = strtolower($file->getExtension());
            if (!in_array($ext, ['js', 'mjs', 'cjs', 'css', 'map', 'json', 'svg', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'woff', 'woff2'], true)) {
                continue;
            }

            $mtime = $file->getMTime();
            if ($mtime > $latest_mtime) {
                $latest_mtime = $mtime;
            }
        }
    }

    $suffix = $latest_mtime ?: time();
    $version = sprintf('%s-%s', DM_PLUGIN_VERSION, $suffix);

    return $version;
}

/**
 * Helper to return the admin screen id for our settings page.
 */
function dm_get_admin_screen_id(): string
{
    return 'settings_page_' . DM_DEV_PAGE_SLUG;
}

/**
 * Add Settings action link in the plugins list table.
 */
add_filter('plugin_action_links_' . plugin_basename(__FILE__), function (array $links): array {
    $url = admin_url('options-general.php?page=' . DM_DEV_PAGE_SLUG);
    $settings_link = sprintf(
        '<a href="%s">%s</a>',
        esc_url($url),
        esc_html__('Settings', 'developer-map')
    );

    $links['settings'] = $settings_link;

    return $links;
});

/**
 * Register plugin settings page within the Settings menu.
 */
add_action('admin_menu', function (): void {
    add_options_page(
        __('Developer Map', 'developer-map'),
        __('Developer Map', 'developer-map'),
        DM_SETTINGS_CAPABILITY,
        DM_DEV_PAGE_SLUG,
        'dm_render_admin_page'
    );
});

/**
 * Render the Developer Map admin experience.
 */
function dm_render_admin_page(): void
{
    if (!current_user_can(DM_SETTINGS_CAPABILITY)) {
        wp_die(
            esc_html__('You do not have sufficient permissions to access this page.', 'developer-map'),
            esc_html__('Access denied', 'developer-map'),
            ['response' => 403]
        );
    }

    $screen = function_exists('get_current_screen') ? get_current_screen() : null;
    if ($screen && $screen->id !== dm_get_admin_screen_id()) {
        return;
    }

    $page_title = esc_html__('Developer Map', 'developer-map');
    $description = esc_html__(
        'Manage the Developer Map dashboard directly from the WordPress admin.',
        'developer-map'
    );

    $nonce_field = wp_nonce_field('dm_admin_save', 'dm_admin_nonce', true, false);

    echo '<div class="wrap dm-admin-wrap">';
    echo '<h1>' . $page_title . '</h1>';
    echo '<p class="description">' . $description . '</p>';
    echo '<div id="dm-root" data-dm-app="developer-map"></div>';
    echo '<form id="dm-admin-form-prototype" class="dm-admin-form-prototype" method="post" style="display:none;">';
    echo $nonce_field;
    echo '<input type="hidden" name="dm_admin_action" value="" />';
    echo '</form>';
    echo '</div>';
}

/**
 * Ensure styles and scripts are registered once per request.
 */
function dm_register_assets(): void
{
    static $registered = false;

    if ($registered) {
        return;
    }

    $base_url = plugin_dir_url(__FILE__) . 'public/assets/';
    $version = dm_get_assets_version();

    wp_register_style(
        DM_PLUGIN_STYLE_HANDLE,
        $base_url . 'dm.css',
        [],
        $version
    );

    wp_register_script(
        DM_PLUGIN_SCRIPT_HANDLE,
        $base_url . 'dm.js',
        [],
        $version,
        true
    );

    wp_script_add_data(DM_PLUGIN_SCRIPT_HANDLE, 'type', 'module');

    $GLOBALS['dm_assets_ver'] = $version;
    $GLOBALS['dm_assets_base'] = $base_url;

    $registered = true;
}

/**
 * Return small CSS tweaks that must always run with the app.
 */
function dm_get_critical_css(): string
{
    return (string) <<<CSS
/* Force hover effects even if theme overrides */
#dm-root.dm-root .dm-board__row {
    overflow: visible !important;
}
#dm-root.dm-root .dm-board__cell--main {
    overflow: visible !important;
}
#dm-root.dm-root .dm-board__thumb {
    transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.35s ease, z-index 0s 0s !important;
    z-index: 1 !important;
}
#dm-root.dm-root .dm-board__thumb--clickable {
    cursor: pointer !important;
}
#dm-root.dm-root .dm-board__thumb--clickable:hover {
    transform: scale(1.8) !important;
    box-shadow: 0 16px 48px rgba(22, 22, 29, 0.3) !important;
    z-index: 100 !important;
}
#dm-root.dm-root .dm-board__thumb--floor.dm-board__thumb--clickable:hover {
    transform: scale(1.8) !important;
    box-shadow: 0 16px 48px rgba(22, 22, 29, 0.3) !important;
}
/* Ensure color variables are used */
#dm-root.dm-root .dm-topbar__title,
#dm-root.dm-root .dm-main-surface__title h1,
#dm-root.dm-root .dm-settings__header h1 {
    color: var(--dm-heading-color, #111827) !important;
}
#dm-root.dm-root .dm-topbar__by,
#dm-root.dm-root .dm-main-surface__title p,
#dm-root.dm-root .dm-board__cell--head,
#dm-root.dm-root .dm-board__cell--type {
    color: var(--dm-content-text-color, #6b7280) !important;
}
#dm-root.dm-root .dm-button--dark,
#dm-root.dm-root .dm-board__cta {
    background: var(--dm-button-color, #7c3aed) !important;
    color: #ffffff !important;
}
CSS;
}

/**
 * Load assets only on the plugin admin screen.
 */
function dm_enqueue_admin_assets(): void
{
    if (!is_admin()) {
        return;
    }

    $screen = function_exists('get_current_screen') ? get_current_screen() : null;
    if (!$screen || $screen->id !== dm_get_admin_screen_id()) {
        return;
    }

    if (!current_user_can(DM_SETTINGS_CAPABILITY)) {
        return;
    }

    dm_register_assets();

    if (function_exists('wp_enqueue_media')) {
        wp_enqueue_media();
    }

    // Enqueue Google Fonts for admin interface
    wp_enqueue_style(
        'dm-google-fonts',
        'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Roboto:wght@400;500;700&family=Playfair+Display:wght@400;500;600;700&family=Fira+Code:wght@400;500;600;700&family=Poppins:wght@400;500;600;700&family=Courier+Prime:wght@400;700&display=swap',
        [],
        null
    );

    wp_enqueue_style(DM_PLUGIN_STYLE_HANDLE);
    wp_add_inline_style(DM_PLUGIN_STYLE_HANDLE, dm_get_critical_css());

    $config = [
        'slug'          => DM_DEV_PAGE_SLUG,
        'screenId'      => dm_get_admin_screen_id(),
        'restBase'      => esc_url_raw(rest_url(DM_Rest_Controller::NAMESPACE . '/')),
        'restNamespace' => DM_Rest_Controller::NAMESPACE,
        'restNonce'     => wp_create_nonce('wp_rest'),
        'ajaxUrl'       => esc_url_raw(admin_url('admin-ajax.php')),
        'ajaxNonce'     => wp_create_nonce(DM_NONCE_ACTION_AJAX),
        'ajaxAction'    => 'dm_ping',
        'ver'           => isset($GLOBALS['dm_assets_ver']) ? $GLOBALS['dm_assets_ver'] : time(),
    ];

    $region_bootstrap = DM_Rest_Controller::get_region_registry_bootstrap();

    wp_add_inline_script(
        DM_PLUGIN_SCRIPT_HANDLE,
        'window.dmRegionBootstrap = ' . wp_json_encode($region_bootstrap) . ';',
        'before'
    );

    wp_add_inline_script(
        DM_PLUGIN_SCRIPT_HANDLE,
        'window.dmRuntimeConfig = ' . wp_json_encode($config) . ';',
        'before'
    );

    wp_enqueue_script(DM_PLUGIN_SCRIPT_HANDLE);
}
add_action('admin_enqueue_scripts', 'dm_enqueue_admin_assets');

/**
 * Ensure the module type attribute is preserved.
 */
function dm_filter_module_script_loader_tag(string $tag, string $handle): string
{
    if ($handle !== DM_PLUGIN_SCRIPT_HANDLE) {
        return $tag;
    }

    if (strpos($tag, 'type=') === false) {
        return str_replace(' src=', ' type="module" src=', $tag);
    }

    return (string) preg_replace('/type=("|\').*?\1/', 'type="module"', $tag, 1);
}
add_filter('script_loader_tag', 'dm_filter_module_script_loader_tag', 10, 2);

if (DM_ENABLE_SHORTCODE_COMPAT) {
    add_action('init', function (): void {
        add_shortcode('devmap', 'dm_render_dashboard_shortcode');
    });
}

add_shortcode('fuudobre_map', 'dm_render_fuudobre_map_shortcode');

function dm_register_frontend_map_assets(): void
{
    static $registered = false;

    if ($registered) {
        return;
    }

    $base_url = plugin_dir_url(__FILE__) . 'public/assets/frontend/';
    $version = dm_get_assets_version();
    wp_register_script(
        'developer-map-frontend',
        $base_url . 'map-viewer.js',
        [],
        $version,
        true
    );

    $registered = true;
}

function dm_render_fuudobre_map_shortcode($atts = []): string
{
    $atts = shortcode_atts(
        [
            'map_key' => '',
            'show_table' => '0',
            'table_mode' => 'current',
            'include_parent' => '0',
        ],
        $atts,
        'fuudobre_map'
    );

    $map_key = sanitize_text_field($atts['map_key']);

    if ('' === $map_key) {
        return '<p class="dm-map-viewer__error">Prosím, zadajte atribút <code>map_key</code>.</p>';
    }

    $normalise_bool = static function ($value): bool {
        $normalized = strtolower(trim((string) $value));
        return in_array($normalized, ['1', 'true', 'yes', 'on'], true);
    };

    $show_table = $normalise_bool($atts['show_table']);
    $include_parent = $normalise_bool($atts['include_parent']);

    $table_mode = strtolower(trim((string) $atts['table_mode']));
    if (!in_array($table_mode, ['current', 'hierarchy'], true)) {
        $table_mode = 'current';
    }

    dm_register_frontend_map_assets();
    wp_enqueue_script('developer-map-frontend');

    static $localized = false;
    if (!$localized) {
        wp_localize_script(
            'developer-map-frontend',
            'dmFrontendConfig',
            [
                'endpoint' => rest_url(DM_Rest_Controller::NAMESPACE . '/project'),
            ]
        );
        $localized = true;
    }

    $attributes = [
        'class="dm-map-viewer__root"',
        sprintf('data-dm-map-key="%s"', esc_attr($map_key)),
    ];

    if ($show_table) {
        $attributes[] = 'data-dm-table="1"';
    }

    if ($table_mode) {
        $attributes[] = sprintf('data-dm-table-mode="%s"', esc_attr($table_mode));
    }

    if ($include_parent) {
        $attributes[] = 'data-dm-include-parent="1"';
    }

    $html = sprintf('<div %s></div>', implode(' ', $attributes));

    return $html;
}

/**
 * Render shortcode output in compatibility mode.
 */
function dm_render_dashboard_shortcode(): string
{
    if (!DM_ENABLE_SHORTCODE_COMPAT) {
        return '';
    }

    if (!is_page(DM_DEV_PAGE_SLUG) || !current_user_can(DM_SETTINGS_CAPABILITY)) {
        return '';
    }

    $url = admin_url('options-general.php?page=' . DM_DEV_PAGE_SLUG);
    $description = esc_html__(
        'Developer Map dashboard is now managed from the WordPress admin area.',
        'developer-map'
    );
    $link = sprintf(
        '<a href="%s">%s</a>',
        esc_url($url),
        esc_html__('Open settings', 'developer-map')
    );

    return sprintf(
        '<div class="dm-shortcode-notice"><p>%s %s.</p></div>',
        $description,
        $link
    );
}

if (DM_ENABLE_SHORTCODE_COMPAT) {
    add_action('template_redirect', function (): void {
        if (is_page(DM_DEV_PAGE_SLUG)) {
            if (!current_user_can(DM_SETTINGS_CAPABILITY)) {
                status_header(404);
                nocache_headers();
                include get_404_template();
                exit;
            }

            // Disable ALL caching for this dev page only (doesn't affect rest of site)
            nocache_headers();

            // Prevent common cache plugins from caching this page
            if (!defined('DONOTCACHEPAGE')) {
                define('DONOTCACHEPAGE', true);
            }
            if (!defined('DONOTCACHEDB')) {
                define('DONOTCACHEDB', true);
            }
            if (!defined('DONOTMINIFY')) {
                define('DONOTMINIFY', true);
            }
            if (!defined('DONOTCDN')) {
                define('DONOTCDN', true);
            }
            if (!defined('DONOTCACHEOBJECT')) {
                define('DONOTCACHEOBJECT', true);
            }
        }
    });

    add_action('wp_head', function (): void {
        if (is_page(DM_DEV_PAGE_SLUG)) {
            echo '<meta name="robots" content="noindex,nofollow" />' . "\n";
            // Extra cache-busting headers for dev page only
            echo '<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />' . "\n";
            echo '<meta http-equiv="Pragma" content="no-cache" />' . "\n";
            echo '<meta http-equiv="Expires" content="0" />' . "\n";
        }
    });

    add_action('pre_get_posts', function ($query): void {
        if ($query->is_main_query() && $query->is_search()) {
            $target_page = get_page_by_path(DM_DEV_PAGE_SLUG);

            if ($target_page instanceof WP_Post) {
                $excluded = (array) $query->get('post__not_in');
                $excluded[] = $target_page->ID;
                $query->set('post__not_in', array_unique($excluded));
            }
        }
    });

    // Exclude dev page from W3 Total Cache
    add_filter('w3tc_can_cache', function ($can_cache) {
        if (is_page(DM_DEV_PAGE_SLUG)) {
            return false;
        }
        return $can_cache;
    }, 10, 1);

    // Exclude dev page from WP Super Cache
    add_filter('wp_super_cache_skip_cache', function ($skip) {
        if (is_page(DM_DEV_PAGE_SLUG)) {
            return true;
        }
        return $skip;
    }, 10, 1);

    // Exclude dev page from WP Fastest Cache
    add_action('wp', function () {
        if (is_page(DM_DEV_PAGE_SLUG) && class_exists('WpFastestCache')) {
            global $wp_fastest_cache;
            if (is_object($wp_fastest_cache)) {
                remove_action('wp_footer', [$wp_fastest_cache, 'wpfc_footer_for_html']);
            }
        }
    }, 0);

    // Exclude dev page from Autoptimize
    add_filter('autoptimize_filter_noptimize', function ($noptimize) {
        if (is_page(DM_DEV_PAGE_SLUG)) {
            return true;
        }
        return $noptimize;
    }, 10, 1);

    // Exclude dev page from WP Rocket (if present)
    add_filter('rocket_override_donotcachepage', function ($override) {
        if (is_page(DM_DEV_PAGE_SLUG)) {
            return true;
        }
        return $override;
    }, 10, 1);
}
