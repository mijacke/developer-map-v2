<?php
/**
 * Data storage manager for Developer Map plugin.
 *
 * Handles persistence of plugin data in WordPress options and user meta.
 *
 * @package DeveloperMap
 */

if (!defined('ABSPATH')) {
    exit;
}

final class DM_Storage_Manager
{
    public const OPTION_KEY = 'dm_data_store';
    public const USER_META_KEY = 'dm_user_store';

    /**
     * Declarative list of allowed storage keys.
     *
     * @var array<string, array{scope: string}>
     */
    private const ALLOWED_KEYS = [
        'dm-projects'            => ['scope' => 'option'],
        'dm-types'               => ['scope' => 'option'],
        'dm-statuses'            => ['scope' => 'option'],
        'dm-colors'              => ['scope' => 'option'],
        'dm-expanded-projects'   => ['scope' => 'user'],
    'dm-images'              => ['scope' => 'option'],
    'dm-selected-font'       => ['scope' => 'option'],
    'dm-fonts'               => ['scope' => 'option'],
    ];

    /**
     * Normalise a key for internal use.
     */
    public static function normalize_key($key): string
    {
        $normalized = strtolower((string) $key);
        $normalized = preg_replace('/[^a-z0-9\-_]/', '', $normalized);

        return (string) $normalized;
    }

    /**
     * Return the key configuration if allowed.
     *
     * @return array{scope: string}|null
     */
    public static function get_key_config(string $key): ?array
    {
        $normalized = self::normalize_key($key);

        return self::ALLOWED_KEYS[$normalized] ?? null;
    }

    /**
     * Determine the storage scope for a key.
     */
    public static function get_scope(string $key): ?string
    {
        $config = self::get_key_config($key);

        return $config['scope'] ?? null;
    }

    /**
     * Retrieve a value from storage.
     *
     * @return mixed|null
     */
    public static function get(string $key, int $user_id = 0)
    {
        $normalized = self::normalize_key($key);
        $scope = self::get_scope($normalized);

        if (!$scope) {
            return null;
        }

        if ('user' === $scope) {
            $user_id = $user_id > 0 ? $user_id : get_current_user_id();
            if ($user_id < 1) {
                return null;
            }

            $store = self::read_user_store($user_id);

            return array_key_exists($normalized, $store) ? $store[$normalized] : null;
        }

        $store = self::read_option_store();

        return array_key_exists($normalized, $store) ? $store[$normalized] : null;
    }

    /**
     * Persist a value into storage.
     *
     * @param mixed $value Arbitrary data structure that will be sanitised.
     *
     * @return mixed Sanitised payload.
     */
    public static function set(string $key, $value, int $user_id = 0)
    {
        $normalized = self::normalize_key($key);
        $scope = self::get_scope($normalized);

        if (!$scope) {
            throw new InvalidArgumentException(sprintf('Unsupported storage key "%s".', $key));
        }

        $sanitised = self::sanitize_payload($value);

        if ('user' === $scope) {
            $user_id = $user_id > 0 ? $user_id : get_current_user_id();
            if ($user_id < 1) {
                throw new RuntimeException('Cannot persist user-scoped data without a user.');
            }

            $store = self::read_user_store($user_id);
            $store[$normalized] = $sanitised;
            self::write_user_store($user_id, $store);

            return $sanitised;
        }

        $store = self::read_option_store();
        $store[$normalized] = $sanitised;
        self::write_option_store($store);

        return $sanitised;
    }

    /**
     * Remove a value from storage.
     */
    public static function remove(string $key, int $user_id = 0): bool
    {
        $normalized = self::normalize_key($key);
        $scope = self::get_scope($normalized);

        if (!$scope) {
            return false;
        }

        if ('user' === $scope) {
            $user_id = $user_id > 0 ? $user_id : get_current_user_id();
            if ($user_id < 1) {
                return false;
            }

            $store = self::read_user_store($user_id);
            if (array_key_exists($normalized, $store)) {
                unset($store[$normalized]);
                self::write_user_store($user_id, $store);
                return true;
            }

            return false;
        }

        $store = self::read_option_store();
        if (array_key_exists($normalized, $store)) {
            unset($store[$normalized]);
            self::write_option_store($store);
            return true;
        }

        return false;
    }

    /**
     * List all values the current user can access.
     */
    public static function list_accessible(int $user_id, bool $include_global): array
    {
        $result = [];

        foreach (self::ALLOWED_KEYS as $key => $config) {
            if ('user' === $config['scope']) {
                $value = self::get($key, $user_id);
                if (null !== $value) {
                    $result[$key] = $value;
                }
                continue;
            }

            if ($include_global) {
                $value = self::get($key);
                if (null !== $value) {
                    $result[$key] = $value;
                }
            }
        }

        return $result;
    }

    /**
     * Sanitise an arbitrary payload deeply.
     *
     * @param mixed $value Raw incoming value.
     *
     * @return mixed
     */
    public static function sanitize_payload($value)
    {
        if (is_array($value)) {
            $sanitised = [];
            foreach ($value as $key => $item) {
                $sanitised_key = $key;
                if (is_string($key)) {
                    $sanitised_key = wp_check_invalid_utf8($key);
                }
                $sanitised[$sanitised_key] = self::sanitize_payload($item);
            }
            return $sanitised;
        }

        if (is_object($value)) {
            return self::sanitize_payload((array) $value);
        }

        if (is_bool($value)) {
            return (bool) $value;
        }

        if (is_int($value) || is_float($value)) {
            return $value;
        }

        if (is_string($value)) {
            $value = wp_check_invalid_utf8($value);
            $value = sanitize_textarea_field($value);
            return $value;
        }

        if (null === $value) {
            return null;
        }

        return sanitize_textarea_field((string) $value);
    }

    /**
     * Load the option store.
     */
    private static function read_option_store(): array
    {
        $option = get_option(self::OPTION_KEY, []);

        return is_array($option) ? $option : [];
    }

    /**
     * Persist the option store.
     */
    private static function write_option_store(array $store): void
    {
        update_option(self::OPTION_KEY, $store, false);
    }

    /**
     * Retrieve the user store.
     */
    private static function read_user_store(int $user_id): array
    {
        $value = get_user_meta($user_id, self::USER_META_KEY, true);

        return is_array($value) ? $value : [];
    }

    /**
     * Persist the user store.
     */
    private static function write_user_store(int $user_id, array $store): void
    {
        update_user_meta($user_id, self::USER_META_KEY, $store);
    }
}
