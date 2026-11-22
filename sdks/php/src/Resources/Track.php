<?php

declare(strict_types=1);

namespace LShorter\Resources;

use LShorter\HttpClient;

final class Track
{
    public function __construct(private readonly HttpClient $http) {}

    /** @param array<string, mixed> $options @return array<string, mixed> */
    public function conversion(array $options): array
    {
        $customer = is_array($options['customer'] ?? null) ? $options['customer'] : [];
        $payload = [
            'eventName' => $options['eventName'] ?? 'conversion',
            'amount' => $options['amount'] ?? 0,
            'currency' => $options['currency'] ?? 'EUR',
            'customerId' => $options['customerId'] ?? $customer['id'] ?? 'usr_anon',
            'linkId' => $options['linkId'] ?? '',
            'clickId' => $options['clickId'] ?? null,
        ];
        $email = $options['customerEmail'] ?? $customer['email'] ?? null;
        $name = $options['customerName'] ?? $options['customerFullName'] ?? $customer['name'] ?? $customer['fullName'] ?? null;
        $avatar = $options['customerAvatar'] ?? $options['avatarUrl'] ?? $customer['avatarUrl'] ?? $customer['avatar'] ?? null;

        if ($email !== null) {
            $payload['customerEmail'] = $email;
        }
        if ($name !== null) {
            $payload['customerName'] = $name;
        }
        if ($avatar !== null) {
            $payload['customerAvatar'] = $avatar;
        }

        return (array) $this->http->post('/api/v1/track', $payload);
    }

    /** @return array<string, mixed> */
    public function list(?int $page = null, ?int $limit = null, ?string $linkId = null): array
    {
        return (array) $this->http->get('/api/v1/track', [
            'page' => $page,
            'limit' => $limit,
            'linkId' => $linkId,
        ]);
    }
}
