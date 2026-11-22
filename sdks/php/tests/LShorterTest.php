<?php

declare(strict_types=1);

namespace LShorter\Tests;

use LShorter\Exceptions\LShorterException;
use LShorter\LShorter;
use LShorter\TransportInterface;
use PHPUnit\Framework\TestCase;

final class LShorterTest extends TestCase
{
    private function createMockTransport(): TransportInterface
    {
        return new class implements TransportInterface {
            public function send(string $method, string $url, array $headers, ?string $body = null): array
            {
                if (($headers['Authorization'] ?? '') !== 'Bearer lsh_live_test') {
                    return [
                        'status' => 401,
                        'body' => json_encode(['success' => false, 'error' => 'Unauthorized', 'code' => 'UNAUTHORIZED'], JSON_THROW_ON_ERROR),
                    ];
                }

                $path = parse_url($url, PHP_URL_PATH) ?: '/';

                if ($method === 'POST' && $path === '/api/v1/links') {
                    return [
                        'status' => 201,
                        'body' => json_encode([
                            'success' => true,
                            'data' => [
                                'id' => 'link_01',
                                'slug' => 'summer-2026',
                                'shortUrl' => 'https://lsho.cc/summer-2026',
                                'targetUrl' => 'https://example.com',
                            ],
                        ], JSON_THROW_ON_ERROR),
                    ];
                }

                if ($method === 'POST' && $path === '/api/v1/track') {
                    $decoded = json_decode((string) $body, true, 512, JSON_THROW_ON_ERROR);
                    return [
                        'status' => 201,
                        'body' => json_encode([
                            'success' => true,
                            'data' => [
                                'id' => 'conv_01',
                                'eventName' => $decoded['eventName'],
                                'amount' => $decoded['amount'],
                                'customerEmail' => $decoded['customerEmail'] ?? null,
                            ],
                        ], JSON_THROW_ON_ERROR),
                    ];
                }

                if ($method === 'GET' && $path === '/api/v1/analytics/export') {
                    return ['status' => 200, 'body' => "id,amount\nconv_01,49.99\n"];
                }

                if ($method === 'GET' && $path === '/api/v1/analytics') {
                    return [
                        'status' => 200,
                        'body' => json_encode([
                            'success' => true,
                            'data' => ['totalClicks' => 120, 'trackedRevenue' => 499.0],
                        ], JSON_THROW_ON_ERROR),
                    ];
                }

                if ($method === 'GET' && $path === '/api/v1/pixels') {
                    return [
                        'status' => 200,
                        'body' => json_encode([
                            'success' => true,
                            'data' => ['pixels' => [['id' => 'px_1', 'platform' => 'pinterest', 'pixelId' => '26123']]],
                        ], JSON_THROW_ON_ERROR),
                    ];
                }

                return [
                    'status' => 404,
                    'body' => json_encode(['success' => false, 'error' => 'Not found'], JSON_THROW_ON_ERROR),
                ];
            }
        };
    }

    public function testEndToEndSdkOperations(): void
    {
        $lsh = new LShorter('lsh_live_test', 'https://api.local', $this->createMockTransport());

        $link = $lsh->links->create([
            'targetUrl' => 'https://example.com',
            'slug' => 'summer-2026',
        ]);
        $this->assertSame('https://lsho.cc/summer-2026', $link['shortUrl']);

        $conv = $lsh->track->conversion([
            'eventName' => 'purchase',
            'amount' => 49.99,
            'currency' => 'EUR',
            'linkId' => 'link_01',
            'customer' => ['email' => 'alice@example.com', 'name' => 'Alice'],
        ]);
        $this->assertSame('alice@example.com', $conv['customerEmail']);

        $stats = $lsh->analytics->dashboard('link_01');
        $this->assertSame(120, $stats['totalClicks']);

        $csv = $lsh->analytics->exportCsv('link_01');
        $this->assertStringContainsString('conv_01,49.99', $csv);

        $pixels = $lsh->pixels->list();
        $this->assertSame('pinterest', $pixels[0]['platform']);
    }

    public function testDashboardOnlyCreateThrows403(): void
    {
        $lsh = new LShorter('lsh_live_test', 'https://api.local', $this->createMockTransport());
        $this->expectException(LShorterException::class);
        $this->expectExceptionCode(403);
        $lsh->webhooks->create();
    }

    public function testUnauthorizedThrows401(): void
    {
        $lsh = new LShorter('lsh_live_wrong', 'https://api.local', $this->createMockTransport());
        $this->expectException(LShorterException::class);
        $this->expectExceptionCode(401);
        $lsh->pixels->list();
    }
}
