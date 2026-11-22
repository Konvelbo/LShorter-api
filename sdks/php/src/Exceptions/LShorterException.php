<?php

declare(strict_types=1);

namespace LShorter\Exceptions;

use RuntimeException;

final class LShorterException extends RuntimeException
{
    public function __construct(
        string $message,
        public readonly int $status = 500,
        public readonly ?string $errorCode = null,
    ) {
        parent::__construct($message, $status);
    }
}
