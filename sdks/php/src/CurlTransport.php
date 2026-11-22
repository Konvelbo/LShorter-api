<?php

declare(strict_types=1);

namespace LShorter;

use LShorter\Exceptions\LShorterException;

final class CurlTransport implements TransportInterface
{
    public function __construct(private readonly int $timeoutSeconds = 15) {}

    public function send(string $method, string $url, array $headers, ?string $body = null): array
    {
        $ch = curl_init($url);
        if ($ch === false) {
            throw new LShorterException('Failed to initialize cURL session', 0, 'TRANSPORT_ERROR');
        }

        $formattedHeaders = [];
        foreach ($headers as $name => $value) {
            $formattedHeaders[] = "{$name}: {$value}";
        }

        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => $formattedHeaders,
            CURLOPT_TIMEOUT => $this->timeoutSeconds,
            CURLOPT_CONNECTTIMEOUT => min($this->timeoutSeconds, 10),
        ]);

        if ($body !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
        }

        $raw = curl_exec($ch);
        if ($raw === false) {
            $err = curl_error($ch);
            curl_close($ch);
            throw new LShorterException("Network error: {$err}", 0, 'NETWORK_ERROR');
        }

        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);

        return ['status' => $status, 'body' => (string) $raw];
    }
}
