<?php

declare(strict_types=1);

namespace LShorter\Resources;

use LShorter\HttpClient;

final class Pixels
{
    public function __construct(private readonly HttpClient $http) {}

    /** @param array<string, mixed> $options @return array<string, mixed> */
    public function create(array $options): array
    {
        $res = (array) $this->http->post('/api/v1/pixels', $options);
        return isset($res['pixel']) && is_array($res['pixel']) ? $res['pixel'] : $res;
    }

    /** @return array<int, array<string, mixed>> */
    public function list(): array
    {
        $res = (array) $this->http->get('/api/v1/pixels');
        return isset($res['pixels']) && is_array($res['pixels']) ? $res['pixels'] : $res;
    }

    /** @return array<string, mixed> */
    public function get(string $id): array
    {
        $res = (array) $this->http->get('/api/v1/pixels/' . rawurlencode($id));
        return isset($res['pixel']) && is_array($res['pixel']) ? $res['pixel'] : $res;
    }

    /** @param array<string, mixed> $options @return array<string, mixed> */
    public function update(string $id, array $options): array
    {
        $res = (array) $this->http->patch('/api/v1/pixels/' . rawurlencode($id), $options);
        return isset($res['pixel']) && is_array($res['pixel']) ? $res['pixel'] : $res;
    }

    /** @return array<string, mixed> */
    public function delete(string $id): array
    {
        return (array) $this->http->delete('/api/v1/pixels/' . rawurlencode($id));
    }
}
