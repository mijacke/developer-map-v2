<?php
/**
 * Developer Map - View Database Content
 * 
 * Otvor v prehliadači: http://devmap.local/wp-content/plugins/developer-map/view-data.php
 * 
 * Tento súbor zobrazí všetky uložené dáta v čitateľnom formáte.
 * Po použití tento súbor VYMAŽ z bezpečnostných dôvodov!
 */

// Load WordPress
require_once(__DIR__ . '/../../../wp-load.php');

// Check if user is admin
if (!current_user_can('manage_options')) {
    wp_die('Nemáte oprávnenie vykonať túto akciu.');
}

// Get data from database
$dm_data_store = get_option('dm_data_store', []);
$current_user_id = get_current_user_id();
$dm_user_store = get_user_meta($current_user_id, 'dm_user_store', true);

// Function to format bytes
function format_bytes($bytes, $precision = 2) {
    $units = array('B', 'KB', 'MB', 'GB');
    $bytes = max($bytes, 0);
    $pow = floor(($bytes ? log($bytes) : 0) / log(1024));
    $pow = min($pow, count($units) - 1);
    $bytes /= pow(1024, $pow);
    return round($bytes, $precision) . ' ' . $units[$pow];
}

// Function to count items recursively
function count_items($data) {
    if (!is_array($data)) {
        return 0;
    }
    $count = 0;
    foreach ($data as $item) {
        if (is_array($item)) {
            $count++;
            if (isset($item['floors']) && is_array($item['floors'])) {
                $count += count($item['floors']);
            }
        } else {
            $count++;
        }
    }
    return $count;
}
?>
<!DOCTYPE html>
<html lang="sk">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Developer Map - Databázový obsah</title>
    <style>
        * { box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; 
            padding: 20px; 
            background: #f0f0f1; 
            margin: 0;
            line-height: 1.6;
        }
        .container { 
            max-width: 1400px; 
            margin: 0 auto; 
            background: white; 
            padding: 30px; 
            border-radius: 8px; 
            box-shadow: 0 2px 8px rgba(0,0,0,0.1); 
        }
        h1 { 
            color: #1d2327; 
            margin-top: 0; 
            border-bottom: 3px solid #2271b1;
            padding-bottom: 10px;
        }
        h2 { 
            color: #2271b1; 
            margin-top: 30px;
            border-bottom: 2px solid #f0f0f1;
            padding-bottom: 8px;
        }
        h3 { 
            color: #50575e; 
            margin-top: 20px;
        }
        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin: 20px 0;
        }
        .stat-box {
            background: #f0f6fc;
            padding: 15px;
            border-radius: 6px;
            border-left: 4px solid #2271b1;
        }
        .stat-label {
            font-size: 12px;
            color: #646970;
            text-transform: uppercase;
            font-weight: 600;
        }
        .stat-value {
            font-size: 24px;
            color: #1d2327;
            font-weight: bold;
            margin-top: 5px;
        }
        .json-viewer {
            background: #282c34;
            color: #abb2bf;
            padding: 20px;
            border-radius: 6px;
            overflow-x: auto;
            font-family: 'Monaco', 'Menlo', monospace;
            font-size: 13px;
            line-height: 1.5;
            max-height: 600px;
            overflow-y: auto;
        }
        .json-key { color: #e06c75; }
        .json-string { color: #98c379; }
        .json-number { color: #d19a66; }
        .json-boolean { color: #56b6c2; }
        .json-null { color: #c678dd; }
        .project-card {
            background: #fff;
            border: 1px solid #ddd;
            border-radius: 6px;
            padding: 15px;
            margin: 10px 0;
        }
        .project-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
        }
        .project-title {
            font-size: 18px;
            font-weight: bold;
            color: #1d2327;
        }
        .project-badge {
            background: #2271b1;
            color: white;
            padding: 4px 12px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 600;
        }
        .project-meta {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 10px;
            margin: 10px 0;
            padding: 10px;
            background: #f6f7f7;
            border-radius: 4px;
        }
        .meta-item {
            font-size: 13px;
        }
        .meta-label {
            color: #646970;
            font-weight: 600;
        }
        .meta-value {
            color: #1d2327;
        }
        .floor-list {
            margin-top: 10px;
            padding-left: 20px;
        }
        .floor-item {
            padding: 8px;
            background: #f9f9f9;
            border-left: 3px solid #2271b1;
            margin: 5px 0;
            font-size: 14px;
        }
        .image-preview {
            max-width: 100px;
            max-height: 100px;
            border-radius: 4px;
            object-fit: cover;
        }
        .warning {
            background: #fcf0f1;
            color: #b32d2e;
            padding: 15px;
            border-radius: 6px;
            margin: 20px 0;
            border-left: 4px solid #b32d2e;
        }
        .info {
            background: #f0f6fc;
            color: #2271b1;
            padding: 15px;
            border-radius: 6px;
            margin: 20px 0;
            border-left: 4px solid #2271b1;
        }
        .button {
            display: inline-block;
            background: #2271b1;
            color: white;
            padding: 10px 20px;
            text-decoration: none;
            border-radius: 4px;
            margin: 10px 10px 10px 0;
            border: none;
            cursor: pointer;
            font-size: 14px;
        }
        .button:hover {
            background: #135e96;
        }
        .button-danger {
            background: #b32d2e;
        }
        .button-danger:hover {
            background: #8a2424;
        }
        pre {
            white-space: pre-wrap;
            word-wrap: break-word;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 15px 0;
        }
        th, td {
            padding: 10px;
            text-align: left;
            border-bottom: 1px solid #ddd;
        }
        th {
            background: #f6f7f7;
            font-weight: 600;
            color: #1d2327;
        }
        .color-swatch {
            display: inline-block;
            width: 20px;
            height: 20px;
            border-radius: 3px;
            border: 1px solid #ddd;
            vertical-align: middle;
            margin-right: 8px;
        }
        .empty-state {
            text-align: center;
            padding: 40px;
            color: #646970;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🗄️ Developer Map - Databázový obsah</h1>
        
        <div class="info">
            <strong>ℹ️ Info:</strong> Zobrazuješ dáta uložené v databáze pre Developer Map plugin.
            <br>User ID: <?php echo $current_user_id; ?>
            <br><br>
            <a href="<?php echo admin_url('options-general.php?page=devtest-9kq7wza3'); ?>" class="button">🚀 Otvoriť Developer Map Admin</a>
        </div>

        <!-- Statistics -->
        <h2>📊 Štatistiky</h2>
        <?php
        // Calculate region statistics
        $total_regions = 0;
        $project_regions = 0;
        $floor_regions = 0;
        $regions_with_php_id = 0;
        if (isset($dm_data_store['dm-projects'])) {
            foreach ($dm_data_store['dm-projects'] as $project) {
                if (isset($project['regions']) && is_array($project['regions'])) {
                    $project_regions += count($project['regions']);
                    foreach ($project['regions'] as $region) {
                        if (!empty($region['id']) && substr($region['id'], 0, 7) === 'region_') {
                            $regions_with_php_id++;
                        }
                    }
                }
                if (isset($project['floors']) && is_array($project['floors'])) {
                    foreach ($project['floors'] as $floor) {
                        if (isset($floor['regions']) && is_array($floor['regions'])) {
                            $floor_regions += count($floor['regions']);
                            foreach ($floor['regions'] as $region) {
                                if (!empty($region['id']) && substr($region['id'], 0, 7) === 'region_') {
                                    $regions_with_php_id++;
                                }
                            }
                        }
                    }
                }
            }
        }
        $total_regions = $project_regions + $floor_regions;
        ?>
        <div class="stats">
            <div class="stat-box">
                <div class="stat-label">Veľkosť wp_options</div>
                <div class="stat-value"><?php echo format_bytes(strlen(serialize($dm_data_store))); ?></div>
            </div>
            <div class="stat-box">
                <div class="stat-label">Počet projektov</div>
                <div class="stat-value"><?php echo isset($dm_data_store['dm-projects']) ? count($dm_data_store['dm-projects']) : 0; ?></div>
            </div>
            <div class="stat-box">
                <div class="stat-label">Počet typov</div>
                <div class="stat-value"><?php echo isset($dm_data_store['dm-types']) ? count($dm_data_store['dm-types']) : 0; ?></div>
            </div>
            <div class="stat-box">
                <div class="stat-label">Počet stavov</div>
                <div class="stat-value"><?php echo isset($dm_data_store['dm-statuses']) ? count($dm_data_store['dm-statuses']) : 0; ?></div>
            </div>
            <div class="stat-box">
                <div class="stat-label">Počet farieb</div>
                <div class="stat-value"><?php echo isset($dm_data_store['dm-colors']) ? count($dm_data_store['dm-colors']) : 0; ?></div>
            </div>
            <div class="stat-box">
                <div class="stat-label">Počet obrázkov</div>
                <div class="stat-value"><?php echo isset($dm_data_store['dm-images']) ? count($dm_data_store['dm-images']) : 0; ?></div>
            </div>
            <div class="stat-box" style="background: #fff3cd; border-left-color: #ffc107;">
                <div class="stat-label">🎨 Celkový počet regiónov</div>
                <div class="stat-value"><?php echo $total_regions; ?></div>
                <div style="font-size: 11px; color: #666; margin-top: 5px;">
                    Project: <?php echo $project_regions; ?> | Floor: <?php echo $floor_regions; ?>
                </div>
            </div>
            <div class="stat-box" style="background: #d4edda; border-left-color: #28a745;">
                <div class="stat-label">✓ Regióny s PHP ID</div>
                <div class="stat-value"><?php echo $regions_with_php_id; ?></div>
                <div style="font-size: 11px; color: #666; margin-top: 5px;">
                    <?php echo $total_regions > 0 ? round(($regions_with_php_id / $total_regions) * 100, 1) : 0; ?>% garantované
                </div>
            </div>
        </div>

        <!-- Projects -->
        <h2>🏢 Projekty (dm-projects)</h2>
        <?php if (isset($dm_data_store['dm-projects']) && !empty($dm_data_store['dm-projects'])): ?>
            <?php foreach ($dm_data_store['dm-projects'] as $project): ?>
                <div class="project-card">
                    <div class="project-header">
                        <div class="project-title"><?php echo esc_html($project['name'] ?? 'Bez názvu'); ?></div>
                        <?php if (isset($project['badge'])): ?>
                            <div class="project-badge"><?php echo esc_html($project['badge']); ?></div>
                        <?php endif; ?>
                    </div>
                    
                    <div class="project-meta">
                        <div class="meta-item">
                            <span class="meta-label">ID:</span>
                            <span class="meta-value"><?php echo esc_html($project['id'] ?? 'N/A'); ?></span>
                        </div>
                        <div class="meta-item">
                            <span class="meta-label">Typ:</span>
                            <span class="meta-value"><?php echo esc_html($project['type'] ?? 'N/A'); ?></span>
                        </div>
                        <div class="meta-item">
                            <span class="meta-label">Public Key:</span>
                            <span class="meta-value"><?php echo esc_html($project['publicKey'] ?? 'N/A'); ?></span>
                        </div>
                        <?php if (isset($project['image']) && !empty($project['image'])): ?>
                            <div class="meta-item">
                                <span class="meta-label">Obrázok:</span><br>
                                <img src="<?php echo esc_url($project['image']); ?>" class="image-preview" alt="Project image">
                            </div>
                        <?php endif; ?>
                    </div>

                    <?php if (isset($project['regions']) && !empty($project['regions'])): ?>
                        <div style="background: #fff3cd; padding: 10px; border-radius: 4px; margin: 10px 0;">
                            <strong>🎨 Project Regions:</strong> <?php echo count($project['regions']); ?> zón
                            <?php foreach ($project['regions'] as $region): ?>
                                <div style="margin-left: 20px; padding: 5px; border-left: 3px solid #ffc107;">
                                    <strong>ID:</strong> <?php echo esc_html($region['id'] ?? 'N/A'); ?> |
                                    <strong>Label:</strong> <?php echo esc_html($region['label'] ?? 'N/A'); ?> |
                                    <strong>Points:</strong> <?php echo isset($region['geometry']['points']) ? count($region['geometry']['points']) : 0; ?> |
                                    <strong>Children:</strong> <?php echo isset($region['children']) ? count($region['children']) : 0; ?>
                                    <?php if (!empty($region['id']) && substr($region['id'], 0, 7) === 'region_'): ?>
                                        <span style="color: green; font-weight: bold;">✓ PHP Generated ID</span>
                                    <?php endif; ?>
                                </div>
                            <?php endforeach; ?>
                        </div>
                    <?php endif; ?>

                    <?php if (isset($project['floors']) && !empty($project['floors'])): ?>
                        <h4>📍 Lokality/Floors (<?php echo count($project['floors']); ?>):</h4>
                        <div class="floor-list">
                            <?php foreach ($project['floors'] as $floor): ?>
                                <div class="floor-item">
                                    <strong><?php echo esc_html($floor['name'] ?? 'Bez názvu'); ?></strong>
                                    | Typ: <?php echo esc_html($floor['type'] ?? 'N/A'); ?>
                                    | Stav: <?php echo esc_html($floor['status'] ?? 'N/A'); ?>
                                    <?php if (isset($floor['image']) && !empty($floor['image'])): ?>
                                        <br><img src="<?php echo esc_url($floor['image']); ?>" class="image-preview" alt="Floor image">
                                    <?php endif; ?>
                                    <?php if (isset($floor['regions']) && !empty($floor['regions'])): ?>
                                        <div style="background: #e7f3ff; padding: 8px; border-radius: 4px; margin-top: 8px;">
                                            <strong>🎨 Floor Regions:</strong> <?php echo count($floor['regions']); ?> zón
                                            <?php foreach ($floor['regions'] as $region): ?>
                                                <div style="margin-left: 15px; padding: 3px; font-size: 12px;">
                                                    <strong>ID:</strong> <?php echo esc_html($region['id'] ?? 'N/A'); ?> |
                                                    <strong>Label:</strong> <?php echo esc_html($region['label'] ?? 'N/A'); ?> |
                                                    <strong>Points:</strong> <?php echo isset($region['geometry']['points']) ? count($region['geometry']['points']) : 0; ?>
                                                    <?php if (!empty($region['id']) && substr($region['id'], 0, 7) === 'region_'): ?>
                                                        <span style="color: green; font-weight: bold;">✓ PHP ID</span>
                                                    <?php endif; ?>
                                                </div>
                                            <?php endforeach; ?>
                                        </div>
                                    <?php endif; ?>
                                </div>
                            <?php endforeach; ?>
                        </div>
                    <?php endif; ?>
                </div>
            <?php endforeach; ?>
        <?php else: ?>
            <div class="empty-state">📭 Žiadne projekty</div>
        <?php endif; ?>

        <!-- Types -->
        <h2>🏷️ Typy lokalít (dm-types)</h2>
        <?php if (isset($dm_data_store['dm-types']) && !empty($dm_data_store['dm-types'])): ?>
            <table>
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Názov</th>
                        <th>Label</th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ($dm_data_store['dm-types'] as $type): ?>
                        <tr>
                            <td><?php echo esc_html($type['id'] ?? 'N/A'); ?></td>
                            <td><?php echo esc_html($type['name'] ?? 'N/A'); ?></td>
                            <td><?php echo esc_html($type['label'] ?? 'N/A'); ?></td>
                        </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        <?php else: ?>
            <div class="empty-state">📭 Žiadne typy</div>
        <?php endif; ?>

        <!-- Statuses -->
        <h2>🎯 Stavy lokalít (dm-statuses)</h2>
        <?php if (isset($dm_data_store['dm-statuses']) && !empty($dm_data_store['dm-statuses'])): ?>
            <table>
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Label</th>
                        <th>Farba</th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ($dm_data_store['dm-statuses'] as $status): ?>
                        <tr>
                            <td><?php echo esc_html($status['id'] ?? 'N/A'); ?></td>
                            <td><?php echo esc_html($status['label'] ?? 'N/A'); ?></td>
                            <td>
                                <?php if (isset($status['color'])): ?>
                                    <span class="color-swatch" style="background-color: <?php echo esc_attr($status['color']); ?>"></span>
                                    <?php echo esc_html($status['color']); ?>
                                <?php else: ?>
                                    N/A
                                <?php endif; ?>
                            </td>
                        </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        <?php else: ?>
            <div class="empty-state">📭 Žiadne stavy</div>
        <?php endif; ?>

        <!-- Colors -->
        <h2>🎨 Farby (dm-colors)</h2>
        <?php if (isset($dm_data_store['dm-colors']) && !empty($dm_data_store['dm-colors'])): ?>
            <table>
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Názov</th>
                        <th>Farba</th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ($dm_data_store['dm-colors'] as $color): ?>
                        <tr>
                            <td><?php echo esc_html($color['id'] ?? 'N/A'); ?></td>
                            <td><?php echo esc_html($color['name'] ?? 'N/A'); ?></td>
                            <td>
                                <?php if (isset($color['value'])): ?>
                                    <span class="color-swatch" style="background-color: <?php echo esc_attr($color['value']); ?>"></span>
                                    <?php echo esc_html($color['value']); ?>
                                <?php else: ?>
                                    N/A
                                <?php endif; ?>
                            </td>
                        </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        <?php else: ?>
            <div class="empty-state">📭 Žiadne farby</div>
        <?php endif; ?>

        <!-- Selected Font -->
        <h2>🔤 Zvolený font (dm-selected-font)</h2>
        <div class="info" style="margin-bottom: 15px;">
            <strong>ℹ️ Poznámka:</strong> Toto je aktuálne zvolený font. V nastaveniach je dostupných všetkých <strong>6 fontov</strong> na výber (Inter, Roboto, Poppins, Playfair Display, Fira Code, Courier Prime).
        </div>
        <?php if (isset($dm_data_store['dm-selected-font']) && !empty($dm_data_store['dm-selected-font'])): ?>
            <?php $font = $dm_data_store['dm-selected-font']; ?>
            <table>
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Názov</th>
                        <th>CSS hodnota</th>
                        <th>Popis</th>
                        <th>Náhľad</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td><?php echo esc_html($font['id'] ?? 'N/A'); ?></td>
                        <td><?php echo esc_html($font['label'] ?? 'N/A'); ?></td>
                        <td style="font-family: monospace; font-size: 11px;"><?php echo esc_html($font['value'] ?? 'N/A'); ?></td>
                        <td><?php echo esc_html($font['description'] ?? 'N/A'); ?></td>
                        <td>
                            <?php if (isset($font['value'])): ?>
                                <span style="font-family: <?php echo esc_attr($font['value']); ?>; font-size: 16px;">
                                    Příklad textu Abc 123 ľščťž
                                </span>
                            <?php endif; ?>
                        </td>
                    </tr>
                </tbody>
            </table>
        <?php else: ?>
            <div class="empty-state">📭 Žiadny font zvolený (default: Inter)</div>
        <?php endif; ?>

        <!-- Images metadata -->
        <h2>🖼️ Obrázky metadata (dm-images)</h2>
        <?php if (isset($dm_data_store['dm-images']) && !empty($dm_data_store['dm-images'])): ?>
            <table>
                <thead>
                    <tr>
                        <th>Kľúč</th>
                        <th>URL</th>
                        <th>ID</th>
                        <th>Alt text</th>
                        <th>Náhľad</th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ($dm_data_store['dm-images'] as $key => $image): ?>
                        <tr>
                            <td><?php echo esc_html($key); ?></td>
                            <td style="font-size: 11px; max-width: 200px; overflow: hidden; text-overflow: ellipsis;">
                                <?php echo esc_html($image['url'] ?? 'N/A'); ?>
                            </td>
                            <td><?php echo esc_html($image['id'] ?? 'N/A'); ?></td>
                            <td><?php echo esc_html($image['alt'] ?? 'N/A'); ?></td>
                            <td>
                                <?php if (isset($image['url'])): ?>
                                    <img src="<?php echo esc_url($image['url']); ?>" class="image-preview" alt="">
                                <?php endif; ?>
                            </td>
                        </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        <?php else: ?>
            <div class="empty-state">📭 Žiadne obrázky</div>
        <?php endif; ?>

        <!-- User Store -->
        <h2>👤 User Store (dm_user_store)</h2>
        <?php if (!empty($dm_user_store)): ?>
            <div class="json-viewer">
                <pre><?php echo htmlspecialchars(json_encode($dm_user_store, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)); ?></pre>
            </div>
        <?php else: ?>
            <div class="empty-state">📭 Žiadne user dáta</div>
        <?php endif; ?>

        <!-- Raw JSON -->
        <h2>📄 Raw JSON Export</h2>
        <details>
            <summary style="cursor: pointer; font-weight: bold; padding: 10px; background: #f6f7f7; border-radius: 4px;">
                Klikni pre zobrazenie kompletného JSON exportu
            </summary>
            <div class="json-viewer" style="margin-top: 15px;">
                <pre><?php echo htmlspecialchars(json_encode($dm_data_store, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)); ?></pre>
            </div>
        </details>

        <!-- Actions -->
        <h2>⚙️ Akcie</h2>
        <a href="<?php echo admin_url('admin.php?page=devtest-9kq7wza3'); ?>" class="button">🔙 Späť do Developer Map</a>
        <a href="reset-data.php" class="button button-danger" onclick="return confirm('Naozaj chceš vymazať všetky dáta?')">🗑️ Vymazať všetky dáta</a>
        
        <div class="warning">
            <strong>⚠️ DÔLEŽITÉ:</strong> Po prezretí dát vymaž tento súbor (view-data.php) z bezpečnostných dôvodov!
        </div>
    </div>
</body>
</html>
