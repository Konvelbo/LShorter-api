<?php

declare(strict_types=1);

namespace LShorter\Resources;

use LShorter\Exceptions\LShorterException;
use LShorter\HttpClient;

final class Pixels
{
    public function __construct(private readonly HttpClient $http) {}

    public function create(): never
    {
        throw new LShorterException(
            'Creating retargeting pixels via the SDK is disabled. Please register your pixels from the LShorter Dashboard (Settings > Retargeting Pixels).',
            403,
        );
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
