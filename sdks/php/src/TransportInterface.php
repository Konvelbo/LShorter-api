<?php

declare(strict_types=1);

namespace LShorter;

interface TransportInterface
{
    /**
     * @param array<string, string> $headers
     * @return array{status: int, body: string}
     */
    public function send(string $method, string $url, array $headers, ?string $body = null): array;
}
