<?php

declare(strict_types=1);

namespace LShorter\Resources;

use LShorter\HttpClient;

final class Domains
{
    public function __construct(private readonly HttpClient $http) {}

    /** @return array<string, mixed> */
    public function create(string $domain): array
    {
        return (array) $this->http->post('/api/v1/domains', ['domain' => $domain]);
    }

    /** @return array<int, mixed> */
    public function list(): array
    {
        return (array) $this->http->get('/api/v1/domains');
    }

    /** @return array<string, mixed> */
    public function get(string $id): array
    {
        return (array) $this->http->get('/api/v1/domains/' . rawurlencode($id));
    }

    /** @return array<string, mixed> */
    public function verify(string $id): array
    {
        return (array) $this->http->post('/api/v1/domains/' . rawurlencode($id) . '/verify', []);
    }

    /** @return array<string, mixed> */
    public function delete(string $id): array
    {
        return (array) $this->http->delete('/api/v1/domains/' . rawurlencode($id));
    }
}
