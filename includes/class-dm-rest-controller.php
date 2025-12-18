<?php
/**
 * REST controller for Developer Map storage.
 *
 * @package DeveloperMap
 */

if (!defined('ABSPATH')) {
    exit;
}

final class DM_Rest_Controller
{
    public const NAMESPACE = 'developer-map/v1';
    private const RATE_LIMIT_WINDOW = 60; // seconds
    private const RATE_LIMIT_LIMIT = 60; // requests per window
    private const TRANSIENT_PREFIX = 'dm_rate_';
    private const MAX_IMAGE_BYTES = 5242880; // 5 MB

    /**
     * Register REST API routes.
     */
    public static function register_routes(): void
    {
        register_rest_route(
            self::NAMESPACE,
            '/list',
            [
                'methods'             => WP_REST_Server::READABLE,
                'callback'            => [self::class, 'handle_list'],
                'permission_callback' => [self::class, 'permission_read'],
            ]
        );

        register_rest_route(
            self::NAMESPACE,
            '/get',
            [
                'methods'             => WP_REST_Server::READABLE,
                'callback'            => [self::class, 'handle_get'],
                'permission_callback' => [self::class, 'permission_read'],
            ]
        );

        register_rest_route(
            self::NAMESPACE,
            '/set',
            [
                'methods'             => WP_REST_Server::CREATABLE,
                'callback'            => [self::class, 'handle_set'],
                'permission_callback' => [self::class, 'permission_mutate'],
            ]
        );

        register_rest_route(
            self::NAMESPACE,
            '/remove',
            [
                'methods'             => WP_REST_Server::DELETABLE,
                'callback'            => [self::class, 'handle_remove'],
                'permission_callback' => [self::class, 'permission_mutate'],
            ]
        );

        register_rest_route(
            self::NAMESPACE,
            '/migrate',
            [
                'methods'             => WP_REST_Server::CREATABLE,
                'callback'            => [self::class, 'handle_migrate'],
                'permission_callback' => [self::class, 'permission_migrate'],
            ]
        );

        register_rest_route(
            self::NAMESPACE,
            '/image',
            [
                'methods'             => WP_REST_Server::CREATABLE,
                'callback'            => [self::class, 'handle_image'],
                'permission_callback' => [self::class, 'permission_image'],
            ]
        );

        register_rest_route(
            self::NAMESPACE,
            '/ping',
            [
                'methods'             => WP_REST_Server::READABLE,
                'callback'            => [self::class, 'handle_ping'],
                'permission_callback' => [self::class, 'permission_read'],
            ]
        );

        register_rest_route(
            self::NAMESPACE,
            '/project',
            [
                'methods'             => WP_REST_Server::READABLE,
                'callback'            => [self::class, 'handle_project'],
                'permission_callback' => '__return_true',
                'args'                => [
                    'public_key' => [
                        'required'          => true,
                        'sanitize_callback' => 'sanitize_text_field',
                    ],
                ],
            ]
        );
    }

    /**
     * Verify nonce and read capability.
     */
    public static function permission_read(WP_REST_Request $request)
    {
        $nonce_check = self::verify_request_nonce($request);
        if (is_wp_error($nonce_check)) {
            return $nonce_check;
        }

        if (!current_user_can('read')) {
            return new WP_Error(
                'dm_forbidden',
                esc_html__('You are not allowed to access these resources.', 'developer-map'),
                ['status' => 403]
            );
        }

        return true;
    }

    /**
     * Verify nonce, capability for mutation and presence of key.
     */
    public static function permission_mutate(WP_REST_Request $request)
    {
        $nonce_check = self::verify_request_nonce($request);
        if (is_wp_error($nonce_check)) {
            return $nonce_check;
        }

        $key = self::extract_key($request, false);
        if (is_wp_error($key)) {
            return $key;
        }

        $config = DM_Storage_Manager::get_key_config($key);
        if (!$config) {
            return new WP_Error(
                'dm_invalid_key',
                esc_html__('Unsupported storage key provided.', 'developer-map'),
                ['status' => 400]
            );
        }

        if ('option' === $config['scope'] && !current_user_can('manage_options')) {
            return new WP_Error(
                'dm_forbidden_option',
                esc_html__('You are not allowed to modify global data.', 'developer-map'),
                ['status' => 403]
            );
        }

        if ('user' === $config['scope'] && !current_user_can('read')) {
            return new WP_Error(
                'dm_forbidden_user',
                esc_html__('You are not allowed to modify user data.', 'developer-map'),
                ['status' => 403]
            );
        }

        return true;
    }

    /**
     * Permission callback for image uploads.
     */
    public static function permission_image(WP_REST_Request $request)
    {
        $permission = self::permission_mutate($request);
        if (is_wp_error($permission)) {
            return $permission;
        }

        if (!current_user_can('upload_files')) {
            return new WP_Error(
                'dm_insufficient_upload_capability',
                esc_html__('You are not allowed to upload files.', 'developer-map'),
                ['status' => 403]
            );
        }

        return true;
    }

    /**
     * Permission callback for migration route.
     */
    public static function permission_migrate(WP_REST_Request $request)
    {
        $nonce_check = self::verify_request_nonce($request);
        if (is_wp_error($nonce_check)) {
            return $nonce_check;
        }

        if (!current_user_can('manage_options')) {
            return new WP_Error(
                'dm_forbidden_migrate',
                esc_html__('You are not allowed to migrate Developer Map data.', 'developer-map'),
                ['status' => 403]
            );
        }

        return true;
    }

    /**
     * Build a normalised list of identifiers that can reference a project.
     */
    private static function project_lookup_candidates(array $project): array
    {
        $candidates = [];

        if (!empty($project['publicKey'])) {
            $candidates[] = strtolower(trim((string) $project['publicKey']));
        }

        if (!empty($project['shortcode'])) {
            $candidates[] = strtolower(trim((string) $project['shortcode']));
        }

        $resolved = strtolower(trim(self::resolve_project_shortcode($project)));
        if ($resolved !== '') {
            $candidates[] = $resolved;
        }

        if (!empty($project['id'])) {
            $candidates[] = strtolower(trim((string) $project['id']));
        }

        $unique = [];
        foreach ($candidates as $candidate) {
            if ($candidate === '') {
                continue;
            }
            $unique[$candidate] = true;
        }

        return array_keys($unique);
    }

    /**
     * Collect all linked projects that are referenced via map children.
     *
     * @param array $project        Root project payload.
     * @param array<string, array> $projectsById  Projects indexed by ID.
     * @param array<string, array> $projectsByKey Projects indexed by lookup key.
     * @return array<string, array>
     */
    private static function resolve_linked_projects(array $project, array $projectsById, array $projectsByKey): array
    {
        $result = [];
        $visited = [];

        self::collect_linked_projects_recursive($project, $projectsById, $projectsByKey, $result, $visited);

        $rootId = strtolower(trim((string) ($project['id'] ?? '')));
        if ($rootId !== '' && isset($result[$rootId])) {
            unset($result[$rootId]);
        }

        return $result;
    }

    /**
     * Resolve ordered ancestor chain for the provided project.
     *
     * @param array $project
     * @param array<string, array> $projectsById
     * @return array<int, array>
     */
    private static function resolve_project_ancestors(array $project, array $projectsById): array
    {
        $ancestors = [];
        $visited = [];
        $current = $project;

        while (true) {
            $parentId = '';

            if (isset($current['parentId'])) {
                $parentId = strtolower(trim((string) $current['parentId']));
            }

            if ($parentId === '' && isset($current['parent']) && is_array($current['parent']) && isset($current['parent']['id'])) {
                $parentId = strtolower(trim((string) $current['parent']['id']));
            }

            if ($parentId === '' || isset($visited[$parentId]) || !isset($projectsById[$parentId])) {
                break;
            }

            $parent = $projectsById[$parentId];
            array_unshift($ancestors, $parent);
            $visited[$parentId] = true;
            $current = $parent;
        }

        return $ancestors;
    }

    /**
     * Recursive helper that walks map children and gathers projects.
     *
     * @param array $project
     * @param array<string, array> $projectsById
     * @param array<string, array> $projectsByKey
     * @param array<string, array> $result
     * @param array<string, bool> $visited
     */
    private static function collect_linked_projects_recursive(
        array $project,
        array $projectsById,
        array $projectsByKey,
        array &$result,
        array &$visited
    ): void {
        $projectId = strtolower(trim((string) ($project['id'] ?? '')));
        if ($projectId !== '') {
            $visited[$projectId] = true;
        }

        $childIds = self::extract_map_child_ids($project);

        foreach ($childIds as $childId) {
            if (isset($visited[$childId])) {
                continue;
            }

            $childProject = $projectsById[$childId] ?? ($projectsByKey[$childId] ?? null);
            if ($childProject === null) {
                $visited[$childId] = true;
                continue;
            }

            $result[$childId] = $childProject;
            $visited[$childId] = true;

            self::collect_linked_projects_recursive($childProject, $projectsById, $projectsByKey, $result, $visited);
        }
    }

    /**
     * Extract referenced map identifiers from project and floor regions.
     */
    private static function extract_map_child_ids(array $project): array
    {
        $ids = [];
        $seen = [];

        $regions = isset($project['regions']) && is_array($project['regions']) ? $project['regions'] : [];
        self::append_map_child_ids_from_regions($regions, $ids, $seen);

        if (!empty($project['floors']) && is_array($project['floors'])) {
            foreach ($project['floors'] as $floor) {
                if (!is_array($floor)) {
                    continue;
                }
                $floorRegions = isset($floor['regions']) && is_array($floor['regions']) ? $floor['regions'] : [];
                self::append_map_child_ids_from_regions($floorRegions, $ids, $seen);
            }
        }

        return $ids;
    }

    /**
     * Append map child IDs from the given regions into the accumulator.
     *
     * @param array<int, mixed> $regions
     * @param array<string>     $ids
     * @param array<string, bool> $seen
     */
    private static function append_map_child_ids_from_regions(array $regions, array &$ids, array &$seen): void
    {
        foreach ($regions as $region) {
            if (!is_array($region)) {
                continue;
            }

            $children = isset($region['children']) && is_array($region['children']) ? $region['children'] : [];

            foreach ($children as $child) {
                $parsed = self::parse_region_child_reference($child);
                if ($parsed === null || $parsed['type'] !== 'map') {
                    continue;
                }

                $identifier = strtolower(trim((string) $parsed['id']));
                if ($identifier === '' || isset($seen[$identifier])) {
                    continue;
                }

                $seen[$identifier] = true;
                $ids[] = $identifier;
            }
        }
    }

    /**
     * Parse a region child value into a normalised reference.
     *
     * @param mixed $value
     * @return array{type: string, id: string}|null
     */
    private static function parse_region_child_reference($value): ?array
    {
        if (is_object($value)) {
            $value = (array) $value;
        }

        if (is_array($value)) {
            $rawId = '';
            if (isset($value['id'])) {
                $rawId = (string) $value['id'];
            } elseif (isset($value['target'])) {
                $rawId = (string) $value['target'];
            } elseif (isset($value['value'])) {
                $rawId = (string) $value['value'];
            }

            $rawId = trim($rawId);
            if ($rawId === '') {
                return null;
            }

            $rawType = '';
            if (isset($value['type'])) {
                $rawType = (string) $value['type'];
            } elseif (isset($value['kind'])) {
                $rawType = (string) $value['kind'];
            } elseif (isset($value['nodeType'])) {
                $rawType = (string) $value['nodeType'];
            } elseif (isset($value['node_type'])) {
                $rawType = (string) $value['node_type'];
            }

            $rawType = strtolower(trim($rawType));
            $type = ($rawType === 'map' || $rawType === 'project') ? 'map' : 'location';

            return [
                'type' => $type,
                'id'   => $rawId,
            ];
        }

        if (!is_string($value) && !is_numeric($value)) {
            return null;
        }

        $raw = trim((string) $value);
        if ($raw === '') {
            return null;
        }

        $parts = explode(':', $raw, 2);
        if (count($parts) === 2) {
            $prefix = strtolower(trim($parts[0]));
            $remainder = trim($parts[1]);
            if ($remainder === '') {
                return null;
            }
            if ($prefix === 'map' || $prefix === 'project') {
                return [
                    'type' => 'map',
                    'id'   => $remainder,
                ];
            }

            return [
                'type' => 'location',
                'id'   => $remainder,
            ];
        }

        return [
            'type' => 'location',
            'id'   => $raw,
        ];
    }

    /**
     * Handle ping route.
     */
    public static function handle_ping(WP_REST_Request $request): WP_REST_Response
    {
        return new WP_REST_Response(
            [
                'ok' => true,
                'ts' => time(),
            ]
        );
    }

    public static function handle_project(WP_REST_Request $request)
    {
        $public_key = sanitize_text_field($request->get_param('public_key'));

        if ('' === $public_key) {
            return new WP_Error(
                'dm_missing_public_key',
                esc_html__('Missing project identifier.', 'developer-map'),
                ['status' => 400]
            );
        }

        $requested_key = strtolower(trim($public_key));
        $stored = DM_Storage_Manager::get('dm-projects');
        $raw_projects = is_array($stored) ? $stored : [];

        $projects = [];
        foreach ($raw_projects as $project) {
            if (!is_array($project)) {
                continue;
            }
            $projects[] = self::normalize_project_payload($project);
        }

        $projectsById = [];
        $projectsByKey = [];

        foreach ($projects as $project) {
            $projectId = strtolower(trim((string) ($project['id'] ?? '')));
            if ($projectId !== '') {
                $projectsById[$projectId] = $project;
            }

            $candidates = self::project_lookup_candidates($project);
            foreach ($candidates as $candidate) {
                $projectsByKey[$candidate] = $project;
            }
        }

        $matchedProject = null;

        foreach ($projects as $project) {
            $candidates = self::project_lookup_candidates($project);
            if (in_array($requested_key, $candidates, true)) {
                $matchedProject = $project;
                break;
            }
        }

        if ($matchedProject !== null) {
            $linkedProjects = self::resolve_linked_projects($matchedProject, $projectsById, $projectsByKey);
             $ancestors = self::resolve_project_ancestors($matchedProject, $projectsById);
            return new WP_REST_Response([
                'project' => $matchedProject,
                'linkedProjects' => array_values($linkedProjects),
                'ancestors' => array_values($ancestors),
            ]);
        }

        foreach ($projects as $project) {
            if (empty($project['floors']) || !is_array($project['floors'])) {
                continue;
            }

            foreach ($project['floors'] as $floor) {
                if (!is_array($floor)) {
                    continue;
                }

                $floorKey = strtolower(trim((string) ($floor['shortcode'] ?? '')));
                if ($floorKey !== '' && $floorKey === $requested_key) {
                    $childPayload = self::build_floor_project_payload($project, $floor);
                    $linkedProjects = self::resolve_linked_projects($childPayload, $projectsById, $projectsByKey);
                    $ancestors = self::resolve_project_ancestors($childPayload, $projectsById);
                    return new WP_REST_Response([
                        'project' => $childPayload,
                        'linkedProjects' => array_values($linkedProjects),
                        'ancestors' => array_values($ancestors),
                    ]);
                }
            }
        }

        return new WP_Error(
            'dm_project_not_found',
            esc_html__('Requested map was not found.', 'developer-map'),
            ['status' => 404]
        );
    }

    /**
     * Ensure all regions in projects have unique IDs.
     * 
     * @param array $projects Array of project objects
     * @return array Projects with guaranteed region IDs
     */
    private static function ensure_region_ids(array $projects): array
    {
        $result = self::process_region_ids($projects);

        return $result['projects'];
    }

    /**
     * Normalize regions array to ensure each has a unique ID.
     *
     * @param array $regions Array of region objects
     * @param array<string, bool> $used_ids Reference to the set of already used IDs
     * @param int $next_index Reference to the next numeric index for generated IDs
     * @param bool $modified Reference flag that becomes true when data was changed
     * @return array Normalized regions with IDs
     */
    private static function normalize_regions(array $regions, array &$used_ids, int &$next_index, bool &$modified): array
    {
        $normalized = [];

        foreach ($regions as $region) {
            if (!is_array($region)) {
                continue;
            }

            $original_id = isset($region['id']) ? (string) $region['id'] : '';
            $resolved_id = self::resolve_region_id($original_id, $used_ids, $next_index);

            if ($resolved_id !== $original_id) {
                $modified = true;
            }

            $region['id'] = $resolved_id;
            $normalized[] = $region;
        }

        return $normalized;
    }

    /**
     * Assign unique region identifiers and collect registry metadata.
     *
     * @param array $projects
     * @return array{projects: array, ids: array, next: int, modified: bool}
     */
    private static function process_region_ids(array $projects): array
    {
        $used_ids = [];
        $next_index = 1;
        $modified = false;

        foreach ($projects as &$project) {
            if (!is_array($project)) {
                continue;
            }

            if (isset($project['regions']) && is_array($project['regions'])) {
                $project['regions'] = self::normalize_regions($project['regions'], $used_ids, $next_index, $modified);
            }

            if (isset($project['floors']) && is_array($project['floors'])) {
                foreach ($project['floors'] as &$floor) {
                    if (!is_array($floor)) {
                        continue;
                    }
                    if (isset($floor['regions']) && is_array($floor['regions'])) {
                        $floor['regions'] = self::normalize_regions($floor['regions'], $used_ids, $next_index, $modified);
                    }
                }
                unset($floor);
            }
        }
        unset($project);

        return [
            'projects' => $projects,
            'ids'      => array_keys($used_ids),
            'next'     => $next_index,
            'modified' => $modified,
        ];
    }

    private static function slugify_token($value, string $fallback = 'mapa'): string
    {
        $string = is_string($value) ? trim($value) : '';
        if ($string === '') {
            return $fallback;
        }

        if (function_exists('remove_accents')) {
            $string = remove_accents($string);
        }

        $string = strtolower($string);
        $string = preg_replace('/[^a-z0-9]+/', '-', $string ?? '');
        $string = trim((string) $string, '-');

        return $string !== '' ? $string : $fallback;
    }

    private static function resolve_project_shortcode(array $project): string
    {
        $fallback = 'mapa';

        if (!empty($project['shortcode']) && is_string($project['shortcode'])) {
            $candidate = trim((string) $project['shortcode']);
            if ($candidate !== '') {
                return self::slugify_token($candidate, $fallback);
            }
        }

        if (!empty($project['publicKey']) && is_string($project['publicKey'])) {
            $candidate = trim((string) $project['publicKey']);
            if ($candidate !== '') {
                return self::slugify_token($candidate, $fallback);
            }
        }

        if (!empty($project['name']) && is_string($project['name'])) {
            return self::slugify_token((string) $project['name'], $fallback);
        }

        if (!empty($project['title']) && is_string($project['title'])) {
            return self::slugify_token((string) $project['title'], $fallback);
        }

        if (!empty($project['id'])) {
            return self::slugify_token((string) $project['id'], $fallback);
        }

        return $fallback;
    }

    private static function resolve_floor_shortcode(array $project, array $floor, int $index, ?string $parentShortcode = null): string
    {
        $base = $parentShortcode ?: self::resolve_project_shortcode($project);
        $fallback = sprintf('%s-%d', $base, $index + 1);

        if (!empty($floor['shortcode']) && is_string($floor['shortcode'])) {
            $candidate = trim((string) $floor['shortcode']);
            if ($candidate !== '') {
                return self::slugify_token($candidate, $fallback);
            }
        }

        return $fallback;
    }

    private static function normalize_project_payload(array $project): array
    {
        $normalized = $project;
        $parentShortcode = self::resolve_project_shortcode($project);
        $normalized['shortcode'] = $parentShortcode;

        if (isset($normalized['floors']) && is_array($normalized['floors'])) {
            $floors = [];
            $ordinal = 0;
            foreach ($normalized['floors'] as $floor) {
                if (!is_array($floor)) {
                    $floors[] = $floor;
                    continue;
                }
                $floorCopy = $floor;
                $floorCopy['shortcode'] = self::resolve_floor_shortcode($normalized, $floorCopy, $ordinal, $parentShortcode);
                $floors[] = $floorCopy;
                $ordinal++;
            }
            $normalized['floors'] = $floors;
        }

        return self::hydrate_project_palette($normalized);
    }

    private static function hydrate_project_palette(array $project): array
    {
        static $cachedGlobalStatuses = null;
        if ($cachedGlobalStatuses === null) {
            $stored = DM_Storage_Manager::get('dm-statuses');
            $cachedGlobalStatuses = is_array($stored) ? $stored : [];
        }

        if (empty($cachedGlobalStatuses)) {
            return $project;
        }

        $palette = isset($project['palette']) && is_array($project['palette']) ? $project['palette'] : [];
        $paletteStatuses = isset($palette['statuses']) && is_array($palette['statuses']) ? $palette['statuses'] : [];

        $globalByKey = [];
        foreach ($cachedGlobalStatuses as $status) {
            if (!is_array($status)) {
                continue;
            }
            $key = '';
            if (isset($status['key']) && $status['key'] !== '') {
                $key = (string) $status['key'];
            }
            if ($key === '' && isset($status['id'])) {
                $key = (string) $status['id'];
            }
            if ($key === '') {
                continue;
            }

            $normalised = [
                'id'        => isset($status['id']) ? (string) $status['id'] : $key,
                'key'       => $key,
                'label'     => isset($status['label']) ? (string) $status['label'] : '',
                'color'     => isset($status['color']) ? (string) $status['color'] : '',
            ];

            if (isset($status['available'])) {
                $normalised['available'] = $status['available'];
            }

            $globalByKey[$key] = $normalised;
        }

        if (empty($globalByKey)) {
            return $project;
        }

        $merged = [];
        $seenKeys = [];

        foreach ($paletteStatuses as $status) {
            if (!is_array($status)) {
                continue;
            }
            $key = '';
            if (isset($status['key']) && $status['key'] !== '') {
                $key = (string) $status['key'];
            }
            if ($key === '' && isset($status['id'])) {
                $key = (string) $status['id'];
            }
            if ($key === '') {
                $merged[] = $status;
                continue;
            }

            $seenKeys[$key] = true;
            if (isset($globalByKey[$key])) {
                $globalStatus = $globalByKey[$key];
                $mergedStatus = $status;
                $mergedStatus['id'] = $globalStatus['id'];
                $mergedStatus['key'] = $globalStatus['key'];
                if ($globalStatus['label'] !== '') {
                    $mergedStatus['label'] = $globalStatus['label'];
                }
                if ($globalStatus['color'] !== '') {
                    $mergedStatus['color'] = $globalStatus['color'];
                }
                if (array_key_exists('available', $globalStatus)) {
                    $mergedStatus['available'] = $globalStatus['available'];
                }
                $merged[] = $mergedStatus;
                unset($globalByKey[$key]);
            } else {
                $merged[] = $status;
            }
        }

        foreach ($globalByKey as $key => $globalStatus) {
            $seenKeys[$key] = true;
            $merged[] = $globalStatus;
        }

        $palette['statuses'] = $merged;
        $project['palette'] = $palette;

        return $project;
    }

    private static function build_floor_project_payload(array $project, array $floor): array
    {
        $payload = $project;
        $floorPayload = $floor;

        $floorImage = '';
        if (!empty($floorPayload['image']) && is_string($floorPayload['image'])) {
            $floorImage = trim((string) $floorPayload['image']);
        } elseif (!empty($floorPayload['imageUrl']) && is_string($floorPayload['imageUrl'])) {
            $floorImage = trim((string) $floorPayload['imageUrl']);
        }

        if ($floorImage !== '') {
            $payload['image'] = $floorImage;
            $payload['imageUrl'] = $floorImage;
        } else {
            $payload['image'] = $payload['image'] ?? ($payload['imageUrl'] ?? '');
            $payload['imageUrl'] = $payload['imageUrl'] ?? ($payload['image'] ?? '');
        }

        $payload['publicKey'] = $floorPayload['shortcode'] ?? $payload['shortcode'];
        $payload['shortcode'] = $floorPayload['shortcode'] ?? $payload['shortcode'];
        $payload['activeFloorId'] = $floorPayload['id'] ?? null;
        $payload['name'] = $floorPayload['name'] ?? ($payload['name'] ?? '');
        if (!empty($floorPayload['label'])) {
            $payload['label'] = $floorPayload['label'];
        } elseif (!isset($payload['label'])) {
            $payload['label'] = $payload['name'];
        }

        $payload['floors'] = [$floorPayload];
        $payload['regions'] = isset($floorPayload['regions']) && is_array($floorPayload['regions'])
            ? $floorPayload['regions']
            : [];

        $payload['parent'] = [
            'id'        => $project['id'] ?? null,
            'name'      => $project['name'] ?? '',
            'shortcode' => $project['shortcode'] ?? self::resolve_project_shortcode($project),
            'publicKey' => $project['publicKey'] ?? ($project['shortcode'] ?? ''),
        ];
        if (!empty($project['id'])) {
            $payload['parentId'] = (string) $project['id'];
        }

        return self::hydrate_project_palette($payload);
    }

    /**
     * Ensure the provided region identifier is unique, generating a new one if needed.
     *
     * @param string $candidate
     * @param array<string, bool> $used_ids
     * @param int $next_index
     * @return string
     */
    private static function resolve_region_id(string $candidate, array &$used_ids, int &$next_index): string
    {
        $candidate = trim($candidate);

        if ($candidate !== '' && !isset($used_ids[$candidate])) {
            $used_ids[$candidate] = true;
            self::update_region_index($candidate, $next_index);

            return $candidate;
        }

        do {
            $generated = sprintf('region-%d', $next_index);
            $next_index++;
        } while (isset($used_ids[$generated]));

        $used_ids[$generated] = true;

        return $generated;
    }

    /**
     * Update the numeric counter for generated IDs based on an existing identifier.
     */
    private static function update_region_index(string $id, int &$next_index): void
    {
        if (preg_match('/^region-(\d+)$/', $id, $matches)) {
            $numeric = (int) $matches[1];
            if ($numeric >= $next_index) {
                $next_index = $numeric + 1;
            }
        }
    }

    /**
     * Return registry metadata for region identifiers consumed by the JS app.
     */
    public static function get_region_registry_bootstrap(): array
    {
        $projects = DM_Storage_Manager::get('dm-projects');
        $projects = is_array($projects) ? $projects : [];

        $result = self::process_region_ids($projects);

        if ($result['modified']) {
            DM_Storage_Manager::set('dm-projects', $result['projects']);
        }

        return [
            'ids'  => $result['ids'],
            'next' => $result['next'],
        ];
    }

    /**
     * Handle list route.
     */
    public static function handle_list(WP_REST_Request $request): WP_REST_Response
    {
        $user_id = get_current_user_id();
        $include_global = current_user_can('manage_options');

        $data = DM_Storage_Manager::list_accessible($user_id, $include_global);

        return new WP_REST_Response(
            [
                'data'   => $data,
                'scopes' => [
                    'user'   => (bool) $user_id,
                    'global' => $include_global,
                ],
            ]
        );
    }

    /**
     * Handle get route.
     */
    public static function handle_get(WP_REST_Request $request)
    {
        $key = self::extract_key($request);
        if (is_wp_error($key)) {
            return $key;
        }

        $scope = DM_Storage_Manager::get_scope($key);
        if ('option' === $scope && !current_user_can('manage_options')) {
            return new WP_Error(
                'dm_forbidden_option',
                esc_html__('You are not allowed to access this data.', 'developer-map'),
                ['status' => 403]
            );
        }

        $value = DM_Storage_Manager::get($key, get_current_user_id());

        // Ensure all regions have unique IDs when loading projects
        if ($key === 'dm-projects' && is_array($value)) {
            $value = self::ensure_region_ids($value);
        }

        return new WP_REST_Response(
            [
                'key'   => $key,
                'value' => $value,
            ]
        );
    }

    /**
     * Handle set route.
     */
    public static function handle_set(WP_REST_Request $request)
    {
        $key = self::extract_key($request);
        if (is_wp_error($key)) {
            return $key;
        }

        $scope = DM_Storage_Manager::get_scope($key);
        $user_id = get_current_user_id();

        $rate_limit = self::enforce_rate_limit($user_id, sprintf('set_%s', $scope));
        if (is_wp_error($rate_limit)) {
            return $rate_limit;
        }

        $payload = $request->get_json_params();
        $value = $payload['value'] ?? null;

        // Ensure all regions have unique IDs when saving projects
        if ($key === 'dm-projects' && is_array($value)) {
            $value = self::ensure_region_ids($value);
        }

        $stored = DM_Storage_Manager::set($key, $value, $user_id);

        return new WP_REST_Response(
            [
                'key'    => $key,
                'stored' => $stored,
            ]
        );
    }

    /**
     * Handle remove route.
     */
    public static function handle_remove(WP_REST_Request $request)
    {
        $key = self::extract_key($request);
        if (is_wp_error($key)) {
            return $key;
        }

        $scope = DM_Storage_Manager::get_scope($key);
        $user_id = get_current_user_id();

        $rate_limit = self::enforce_rate_limit($user_id, sprintf('remove_%s', $scope));
        if (is_wp_error($rate_limit)) {
            return $rate_limit;
        }

        $deleted = DM_Storage_Manager::remove($key, $user_id);

        return new WP_REST_Response(
            [
                'key'     => $key,
                'deleted' => (bool) $deleted,
            ]
        );
    }

    /**
     * Handle migrate route.
     */
    public static function handle_migrate(WP_REST_Request $request)
    {
        $payload = $request->get_json_params();
        $entries = $payload['payload'] ?? [];

        if (!is_array($entries)) {
            return new WP_Error(
                'dm_invalid_payload',
                esc_html__('Migration payload must be an object.', 'developer-map'),
                ['status' => 400]
            );
        }

        $user_id = get_current_user_id();
        $result = [
            'migrated' => [],
            'skipped'  => [],
        ];

        foreach ($entries as $raw_key => $value) {
            $key = DM_Storage_Manager::normalize_key($raw_key);
            $config = DM_Storage_Manager::get_key_config($key);
            if (!$config) {
                $result['skipped'][$key] = 'unsupported';
                continue;
            }

            $existing = DM_Storage_Manager::get($key, $user_id);
            if (null !== $existing) {
                $result['skipped'][$key] = 'exists';
                continue;
            }

            try {
                DM_Storage_Manager::set($key, $value, $user_id);
                $result['migrated'][$key] = true;
            } catch (Throwable $exception) {
                $result['skipped'][$key] = $exception->getMessage();
            }
        }

        return new WP_REST_Response($result);
    }

    /**
     * Handle image route.
     */
    public static function handle_image(WP_REST_Request $request)
    {
        $payload = $request->get_json_params();
        $key = self::extract_key($request);
        if (is_wp_error($key)) {
            return $key;
        }

        $attachment_id = isset($payload['attachment_id']) ? absint($payload['attachment_id']) : 0;
        if ($attachment_id < 1) {
            return new WP_Error(
                'dm_invalid_attachment',
                esc_html__('Missing attachment identifier.', 'developer-map'),
                ['status' => 400]
            );
        }

        $post = get_post($attachment_id);
        if (!$post || 'attachment' !== $post->post_type) {
            return new WP_Error(
                'dm_missing_attachment',
                esc_html__('Attachment not found.', 'developer-map'),
                ['status' => 404]
            );
        }

        if (!wp_attachment_is_image($attachment_id)) {
            return new WP_Error(
                'dm_invalid_mime',
                esc_html__('Only image attachments are allowed.', 'developer-map'),
                ['status' => 400]
            );
        }

        $file_path = get_attached_file($attachment_id);
        if ($file_path && file_exists($file_path)) {
            $size = filesize($file_path);
            $limit = (int) apply_filters('dm_image_size_limit', self::MAX_IMAGE_BYTES);
            if ($size > $limit) {
                return new WP_Error(
                    'dm_image_too_large',
                    sprintf(
                        /* translators: %s: human readable size */
                        esc_html__('The selected image is too large. Maximum allowed size is %s.', 'developer-map'),
                        size_format($limit)
                    ),
                    ['status' => 400]
                );
            }
        }

        $entity_id = isset($payload['entity_id']) ? sanitize_text_field($payload['entity_id']) : '';
        if ($entity_id === '') {
            return new WP_Error(
                'dm_missing_entity',
                esc_html__('Missing entity identifier for image assignment.', 'developer-map'),
                ['status' => 400]
            );
        }

        $scope = DM_Storage_Manager::get_scope($key);
        $user_id = get_current_user_id();
        $rate_limit = self::enforce_rate_limit($user_id, 'image');
        if (is_wp_error($rate_limit)) {
            return $rate_limit;
        }

        $url = wp_get_attachment_url($attachment_id);
        $alt = (string) get_post_meta($attachment_id, '_wp_attachment_image_alt', true);

        $image_payload = [
            'id'         => $attachment_id,
            'url'        => $url ? esc_url_raw($url) : '',
            'alt'        => sanitize_text_field($alt),
            'updated_at' => current_time('mysql', true),
            'entity_id'  => $entity_id,
            'key'        => $key,
        ];

        $stored_images = DM_Storage_Manager::get('dm-images') ?? [];
        if (!is_array($stored_images)) {
            $stored_images = [];
        }
        $stored_images[$entity_id] = $image_payload;
        DM_Storage_Manager::set('dm-images', $stored_images);

        return new WP_REST_Response(
            [
                'image' => $image_payload,
                'key'   => $key,
                'scope' => $scope,
            ]
        );
    }

    /**
     * Extract and normalise key from request.
     *
     * @return string|WP_Error
     */
    private static function extract_key(WP_REST_Request $request, bool $required = true)
    {
        $key = $request->get_param('key');
        if ($key === null && $required) {
            $body = $request->get_json_params();
            $key = $body['key'] ?? null;
        }

        if ($key === null) {
            if ($required) {
                return new WP_Error(
                    'dm_missing_key',
                    esc_html__('Missing storage key.', 'developer-map'),
                    ['status' => 400]
                );
            }

            return '';
        }

        return DM_Storage_Manager::normalize_key($key);
    }

    /**
     * Verify REST nonce.
     */
    private static function verify_request_nonce(WP_REST_Request $request)
    {
        $nonce = $request->get_header('X-WP-Nonce');
        if (!$nonce || !wp_verify_nonce($nonce, 'wp_rest')) {
            return new WP_Error(
                'dm_invalid_nonce',
                esc_html__('Invalid or missing security token.', 'developer-map'),
                ['status' => 403]
            );
        }

        return true;
    }

    /**
     * Enforce simple rate limiting using transients.
     */
    private static function enforce_rate_limit(int $user_id, string $action)
    {
        $user_id = $user_id > 0 ? $user_id : 0;
        $fingerprint = sprintf('%d|%s', $user_id, $action);
        $transient_key = self::TRANSIENT_PREFIX . md5($fingerprint);
        $record = get_transient($transient_key);
        $timestamp = time();

        if (!is_array($record) || !isset($record['count'], $record['reset'])) {
            $record = [
                'count' => 0,
                'reset' => $timestamp + self::RATE_LIMIT_WINDOW,
            ];
        }

        if ($record['reset'] <= $timestamp) {
            $record = [
                'count' => 0,
                'reset' => $timestamp + self::RATE_LIMIT_WINDOW,
            ];
        }

        if ($record['count'] >= self::RATE_LIMIT_LIMIT) {
            $seconds = max(1, $record['reset'] - $timestamp);
            return new WP_Error(
                'dm_rate_limited',
                sprintf(
                    /* translators: %d: seconds */
                    esc_html__('Too many requests. Try again in %d seconds.', 'developer-map'),
                    $seconds
                ),
                ['status' => 429]
            );
        }

        $record['count']++;
        set_transient($transient_key, $record, self::RATE_LIMIT_WINDOW);

        return true;
    }
}
