<?php

declare(strict_types=1);

namespace LShorter\Resources;

use LShorter\HttpClient;

final class Analytics
{
    public function __construct(private readonly HttpClient $http) {}

    /** @return array<string, mixed> */
    public function dashboard(?string $linkId = null, ?string $from = null, ?string $to = null): array
    {
        return (array) $this->http->get('/api/v1/analytics', [
            'linkId' => $linkId,
            'from' => $from,
            'to' => $to,
        ]);
    }

    /** @return array<string, mixed> */
    public function top(?string $linkId = null): array
    {
        return (array) $this->http->get('/api/v1/analytics/top', ['linkId' => $linkId]);
    }

    /** @return array<int, mixed> */
    public function links(?int $limit = null): array
    {
        return (array) $this->http->get('/api/v1/analytics/links', ['limit' => $limit]);
    }

    public function exportCsv(?string $linkId = null): string
    {
        return $this->http->requestText('/api/v1/analytics/export', ['linkId' => $linkId]);
    }
}
