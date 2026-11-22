<?php

declare(strict_types=1);

namespace LShorter;

use LShorter\Resources\Analytics;
use LShorter\Resources\Domains;
use LShorter\Resources\Links;
use LShorter\Resources\Notifications;
use LShorter\Resources\Pixels;
use LShorter\Resources\Track;
use LShorter\Resources\Webhooks;

final class LShorter
{
    public readonly Links $links;
    public readonly Track $track;
    public readonly Analytics $analytics;
    public readonly Domains $domains;
    public readonly Webhooks $webhooks;
    public readonly Pixels $pixels;
    public readonly Notifications $notifications;
    public readonly Notifications $targets;

    private readonly HttpClient $http;

    public function __construct(
        string $apiKey,
        ?string $baseUrl = null,
        ?TransportInterface $transport = null,
        int $timeoutSeconds = 15,
    ) {
        $this->http = new HttpClient($apiKey, $baseUrl, $transport, $timeoutSeconds);
        $this->links = new Links($this->http);
        $this->track = new Track($this->http);
        $this->analytics = new Analytics($this->http);
        $this->domains = new Domains($this->http);
        $this->webhooks = new Webhooks($this->http);
        $this->pixels = new Pixels($this->http);
        $this->notifications = new Notifications($this->http);
        $this->targets = $this->notifications;
    }
}
