<?php
/**
 * Developer Map - Test Default Data Creation
 * 
 * Otvor v prehliadači: http://devmap.local/wp-content/plugins/developer-map/test-defaults.php
 * 
 * Tento script overí či sa defaultné dáta správne vytvárajú.
 */

// Load WordPress
require_once(__DIR__ . '/../../../wp-load.php');

// Check if user is admin
if (!current_user_can('manage_options')) {
    wp_die('Nemáte oprávnenie vykonať túto akciu.');
}

// Get data from database
$dm_data_store = get_option('dm_data_store', []);

?>
<!DOCTYPE html>
<html lang="sk">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Developer Map - Test Default Data</title>
    <style>
        body { 
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; 
            padding: 40px; 
            background: #f0f0f1; 
            margin: 0;
        }
        .container { 
            max-width: 800px; 
            margin: 0 auto; 
            background: white; 
            padding: 30px; 
            border-radius: 8px; 
            box-shadow: 0 2px 8px rgba(0,0,0,0.1); 
        }
        h1 { color: #1d2327; margin-top: 0; }
        .test { 
            background: #f6f7f7; 
            padding: 15px; 
            border-radius: 4px; 
            margin: 15px 0;
            border-left: 4px solid #2271b1;
        }
        .success { border-left-color: #00a32a; background: #e7f7e9; }
        .error { border-left-color: #cc1818; background: #fcf0f1; }
        .label { font-weight: 600; color: #1d2327; margin-bottom: 5px; }
        .value { font-family: monospace; color: #50575e; }
        .button { 
            display: inline-block; 
            background: #2271b1; 
            color: white; 
            padding: 10px 20px; 
            text-decoration: none; 
            border-radius: 4px; 
            margin: 10px 10px 10px 0;
        }
        .button:hover { background: #135e96; }
        .button-danger { background: #b32d2e; }
        .button-danger:hover { background: #8a2424; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🧪 Developer Map - Test Default Data</h1>

        <!-- Test Types -->
        <div class="test <?php echo isset($dm_data_store['dm-types']) && count($dm_data_store['dm-types']) > 0 ? 'success' : 'error'; ?>">
            <div class="label">✓ Typy (dm-types)</div>
            <div class="value">
                <?php if (isset($dm_data_store['dm-types']) && count($dm_data_store['dm-types']) > 0): ?>
                    ✅ Nájdených: <?php echo count($dm_data_store['dm-types']); ?> typov
                    <ul>
                        <?php foreach ($dm_data_store['dm-types'] as $type): ?>
                            <li><?php echo esc_html($type['name'] ?? $type['label'] ?? 'N/A'); ?> (<?php echo esc_html($type['id']); ?>)</li>
                        <?php endforeach; ?>
                    </ul>
                <?php else: ?>
                    ❌ Žiadne typy nenájdené
                <?php endif; ?>
            </div>
        </div>

        <!-- Test Statuses -->
        <div class="test <?php echo isset($dm_data_store['dm-statuses']) && count($dm_data_store['dm-statuses']) > 0 ? 'success' : 'error'; ?>">
            <div class="label">✓ Stavy (dm-statuses)</div>
            <div class="value">
                <?php if (isset($dm_data_store['dm-statuses']) && count($dm_data_store['dm-statuses']) > 0): ?>
                    ✅ Nájdených: <?php echo count($dm_data_store['dm-statuses']); ?> stavov
                    <ul>
                        <?php foreach ($dm_data_store['dm-statuses'] as $status): ?>
                            <li><?php echo esc_html($status['label'] ?? 'N/A'); ?> (<?php echo esc_html($status['id']); ?>)</li>
                        <?php endforeach; ?>
                    </ul>
                <?php else: ?>
                    ❌ Žiadne stavy nenájdené
                <?php endif; ?>
            </div>
        </div>

        <!-- Test Colors -->
        <div class="test <?php echo isset($dm_data_store['dm-colors']) && count($dm_data_store['dm-colors']) > 0 ? 'success' : 'error'; ?>">
            <div class="label">✓ Farby (dm-colors)</div>
            <div class="value">
                <?php if (isset($dm_data_store['dm-colors']) && count($dm_data_store['dm-colors']) > 0): ?>
                    ✅ Nájdených: <?php echo count($dm_data_store['dm-colors']); ?> farieb
                    <ul>
                        <?php foreach ($dm_data_store['dm-colors'] as $color): ?>
                            <li>
                                <span style="display:inline-block;width:20px;height:20px;background:<?php echo esc_attr($color['value']); ?>;border:1px solid #ddd;vertical-align:middle;margin-right:8px;"></span>
                                <?php echo esc_html($color['name'] ?? 'N/A'); ?> (<?php echo esc_html($color['id']); ?>)
                            </li>
                        <?php endforeach; ?>
                    </ul>
                <?php else: ?>
                    ❌ Žiadne farby nenájdené
                <?php endif; ?>
            </div>
        </div>

        <!-- Test Font -->
        <div class="test <?php echo isset($dm_data_store['dm-selected-font']) ? 'success' : 'error'; ?>">
            <div class="label">✓ Zvolený font (dm-selected-font)</div>
            <div class="value">
                <?php if (isset($dm_data_store['dm-selected-font'])): ?>
                    <?php $font = $dm_data_store['dm-selected-font']; ?>
                    ✅ Font: <?php echo esc_html($font['label'] ?? 'N/A'); ?>
                    <br>
                    <span style="font-family: <?php echo esc_attr($font['value'] ?? 'inherit'); ?>; font-size: 18px; margin-top: 10px; display: block;">
                        Príklad textu v tomto fonte: Abc 123 ľščťž
                    </span>
                <?php else: ?>
                    ❌ Žiadny font zvolený
                <?php endif; ?>
            </div>
        </div>

        <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">

        <a href="<?php echo admin_url('admin.php?page=devtest-9kq7wza3'); ?>" class="button">🔙 Späť do Developer Map</a>
        <a href="view-data.php" class="button">📊 Zobraziť všetky dáta</a>
        <a href="reset-data.php" class="button button-danger" onclick="return confirm('Naozaj chceš vymazať všetky dáta a testovať znova?')">🗑️ Reset & Test Again</a>
    </div>
</body>
</html>
