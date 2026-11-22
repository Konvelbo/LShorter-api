<?php

declare(strict_types=1);

namespace LShorter\Resources;

use LShorter\HttpClient;

final class Links
{
    public function __construct(private readonly HttpClient $http) {}

    /** @param array<string, mixed> $options @return array<string, mixed> */
    public function create(array $options): array
    {
        return (array) $this->http->post('/api/v1/links', $options);
    }

    /** @return array<string, mixed> */
    public function list(?int $page = null, ?int $limit = null): array
    {
        return (array) $this->http->get('/api/v1/links', ['page' => $page, 'limit' => $limit]);
    }

    /** @return array<string, mixed> */
    public function get(string $id): array
    {
        return (array) $this->http->get('/api/v1/links/' . rawurlencode($id));
    }

    /** @param array<string, mixed> $options @return array<string, mixed> */
    public function update(string $id, array $options): array
    {
        return (array) $this->http->patch('/api/v1/links/' . rawurlencode($id), $options);
    }

    /** @return array<string, mixed> */
    public function delete(string $id): array
    {
        return (array) $this->http->delete('/api/v1/links/' . rawurlencode($id));
    }
}
