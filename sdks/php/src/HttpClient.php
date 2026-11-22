<?php

declare(strict_types=1);

namespace LShorter;

use LShorter\Exceptions\LShorterException;

final class HttpClient
{
    public const DEFAULT_BASE_URL = 'https://lshorter-api.fiatechnologiecam.workers.dev';

    private readonly string $baseUrl;
    private readonly string $apiKey;
    private readonly TransportInterface $transport;

    public function __construct(
        string $apiKey,
        ?string $baseUrl = null,
        ?TransportInterface $transport = null,
        int $timeoutSeconds = 15,
    ) {
        $trimmedKey = trim($apiKey);
        if ($trimmedKey === '') {
            throw new \InvalidArgumentException('apiKey is required');
        }
        $base = rtrim($baseUrl ?? self::DEFAULT_BASE_URL, '/');
        if ($base === 'https://lsho.cc' || $base === 'https://api.lsho.cc') {
            $base = self::DEFAULT_BASE_URL;
        }
        $this->apiKey = $trimmedKey;
        $this->baseUrl = $base;
        $this->transport = $transport ?? new CurlTransport($timeoutSeconds);
    }

    /**
     * @param array<string, mixed>|null $body
     * @param array<string, scalar|null> $params
     * @return mixed
     */
    public function request(string $method, string $path, ?array $body = null, array $params = []): mixed
    {
        $url = $this->buildUrl($path, $params);
        $headers = [
            'Authorization' => 'Bearer ' . $this->apiKey,
            'Accept' => 'application/json',
            'User-Agent' => 'lshorter-php/1.0.0',
        ];

        $encodedBody = null;
        if ($body !== null) {
            $headers['Content-Type'] = 'application/json';
            $encodedBody = json_encode($body, JSON_THROW_ON_ERROR);
        }

        $res = $this->transport->send($method, $url, $headers, $encodedBody);
        $status = $res['status'];
        $decoded = json_decode($res['body'], true);

        if (!is_array($decoded)) {
            throw new LShorterException($res['body'] ?: "HTTP {$status}", $status);
        }

        if ($status >= 400 || empty($decoded['success'])) {
            $message = is_string($decoded['error'] ?? null) ? $decoded['error'] : "HTTP {$status}";
            $code = is_string($decoded['code'] ?? null) ? $decoded['code'] : null;
            throw new LShorterException($message, $status, $code);
        }

        if (isset($decoded['pagination']) && is_array($decoded['data'] ?? null)) {
            return [
                'data' => $decoded['data'],
                'pagination' => $decoded['pagination'],
            ];
        }

        return $decoded['data'] ?? null;
    }

    /**
     * @param array<string, scalar|null> $params
     */
    public function requestText(string $path, array $params = []): string
    {
        $url = $this->buildUrl($path, $params);
        $res = $this->transport->send('GET', $url, [
            'Authorization' => 'Bearer ' . $this->apiKey,
            'User-Agent' => 'lshorter-php/1.0.0',
        ]);

        if ($res['status'] >= 400) {
            $decoded = json_decode($res['body'], true);
            $msg = is_array($decoded) && is_string($decoded['error'] ?? null)
                ? $decoded['error']
                : ($res['body'] ?: "HTTP {$res['status']}");
            $code = is_array($decoded) && is_string($decoded['code'] ?? null) ? $decoded['code'] : null;
            throw new LShorterException($msg, $res['status'], $code);
        }

        return $res['body'];
    }

    /** @param array<string, scalar|null> $params */
    public function get(string $path, array $params = []): mixed
    {
        return $this->request('GET', $path, null, $params);
    }

    /** @param array<string, mixed> $body */
    public function post(string $path, array $body): mixed
    {
        return $this->request('POST', $path, $body);
    }

    /** @param array<string, mixed> $body */
    public function patch(string $path, array $body): mixed
    {
        return $this->request('PATCH', $path, $body);
    }

    public function delete(string $path): mixed
    {
        return $this->request('DELETE', $path);
    }

    /** @param array<string, scalar|null> $params */
    private function buildUrl(string $path, array $params): string
    {
        $filtered = array_filter($params, static fn ($v): bool => $v !== null && $v !== '');
        $url = $this->baseUrl . $path;
        if ($filtered !== []) {
            $url .= '?' . http_build_query($filtered);
        }
        return $url;
    }
}
