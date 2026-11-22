<?php

declare(strict_types=1);

namespace LShorter\Resources;

use LShorter\Exceptions\LShorterException;
use LShorter\HttpClient;

final class Notifications
{
    public function __construct(private readonly HttpClient $http) {}

    public function create(): never
    {
        throw new LShorterException(
            'Creating target alerts and notifications via the SDK is disabled. Notifications must be configured directly from the LShorter Dashboard (Settings > Notifications).',
            403,
        );
    }

    /** @return array<int, array<string, mixed>> */
    public function list(): array
    {
        $res = (array) $this->http->get('/api/v1/targets');
        return isset($res['data']) && is_array($res['data']) ? $res['data'] : $res;
    }

    /** @return array<string, mixed> */
    public function get(string $id): array
    {
        foreach ($this->list() as $alert) {
            if (($alert['id'] ?? null) === $id) {
                return $alert;
            }
        }
        throw new LShorterException('Target alert not found', 404);
    }
}
