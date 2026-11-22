<?php

declare(strict_types=1);

namespace LShorter\Resources;

use LShorter\HttpClient;

final class Webhooks
{
    public function __construct(private readonly HttpClient $http) {}

    /** @param array<string, mixed> $options @return array<string, mixed> */
    public function create(array $options): array
    {
        $res = (array) $this->http->post('/api/v1/webhooks', $options);
        return isset($res['webhook']) && is_array($res['webhook']) ? $res['webhook'] : $res;
    }

    /** @return array<int, array<string, mixed>> */
    public function list(): array
    {
        $res = (array) $this->http->get('/api/v1/webhooks');
        return isset($res['webhooks']) && is_array($res['webhooks']) ? $res['webhooks'] : $res;
    }

    /** @return array<string, mixed> */
    public function get(string $id): array
    {
        $res = (array) $this->http->get('/api/v1/webhooks/' . rawurlencode($id));
        return isset($res['webhook']) && is_array($res['webhook']) ? $res['webhook'] : $res;
    }

    /** @param array<string, mixed> $options @return array<string, mixed> */
    public function update(string $id, array $options): array
    {
        $res = (array) $this->http->patch('/api/v1/webhooks/' . rawurlencode($id), $options);
        return isset($res['webhook']) && is_array($res['webhook']) ? $res['webhook'] : $res;
    }

    /** @return array<string, mixed> */
    public function delete(string $id): array
    {
        return (array) $this->http->delete('/api/v1/webhooks/' . rawurlencode($id));
    }
}
