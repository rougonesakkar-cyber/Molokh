import { randomUUID } from 'node:crypto';

import {
  IdempotencyKeyReusedError,
  IdentityPermissionDeniedError,
  IdentityValidationError,
  InvalidCommandEnvelopeError,
  InvalidIdentityTransitionError,
  MinimumAgeNotMetError,
  InvalidRoleGrantTransitionError,
  RoleGrantPermissionDeniedError,
  RoleGrantValidationError,
  VersionConflictError,
} from '@molokh/core';
import type { ApiError } from '@molokh/contracts';
import type { FastifyInstance, FastifyRequest } from 'fastify';

export interface TransportContext {
  readonly requestId: string;
  readonly correlationId: string;
  readonly causationId: string | null;
}

declare module 'fastify' {
  interface FastifyRequest {
    transportContext: TransportContext | null;
  }
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validHeaderId(value: string | string[] | undefined): string | null {
  if (typeof value !== 'string') return null;
  const candidate = value.trim();
  return uuidPattern.test(candidate) ? candidate.toLowerCase() : null;
}

export function requestContext(request: FastifyRequest): TransportContext {
  if (!request.transportContext) throw new Error('Transport context is unavailable');
  return request.transportContext;
}

export interface HttpErrorMapping {
  readonly statusCode: number;
  readonly body: ApiError;
}

export function mapApiError(error: unknown, requestId: string): HttpErrorMapping {
  if (error instanceof VersionConflictError) {
    return {
      statusCode: 409,
      body: { code: error.code, message: 'Resource changed; refresh and try again', requestId },
    };
  }
  if (error instanceof IdempotencyKeyReusedError) {
    return {
      statusCode: 409,
      body: {
        code: error.code,
        message: 'This operation key was already used for different input',
        requestId,
      },
    };
  }
  if (error instanceof MinimumAgeNotMetError) {
    return {
      statusCode: 422,
      body: { code: error.code, message: 'Minimum account age is 14', requestId },
    };
  }
  if (error instanceof IdentityValidationError) {
    return {
      statusCode: 422,
      body: { code: error.code, message: 'Identity update is not valid', requestId },
    };
  }
  if (error instanceof InvalidIdentityTransitionError) {
    return {
      statusCode: 409,
      body: { code: error.code, message: 'Identity state no longer allows this action', requestId },
    };
  }
  if (error instanceof IdentityPermissionDeniedError) {
    return {
      statusCode: 403,
      body: { code: error.code, message: 'This action requires Central permission', requestId },
    };
  }
  if (error instanceof InvalidRoleGrantTransitionError) {
    return {
      statusCode: 409,
      body: {
        code: error.code,
        message: 'Role grant state no longer allows this action',
        requestId,
      },
    };
  }
  if (error instanceof RoleGrantPermissionDeniedError) {
    return {
      statusCode: 403,
      body: {
        code: error.code,
        message: 'This action is outside your role scope',
        requestId,
      },
    };
  }
  if (error instanceof RoleGrantValidationError) {
    return {
      statusCode: 422,
      body: {
        code: error.code,
        message: 'Role grant request is not valid',
        requestId,
      },
    };
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'IDENTITY_NOT_FOUND'
  ) {
    return {
      statusCode: 404,
      body: { code: 'IDENTITY_NOT_FOUND', message: 'Identity was not found', requestId },
    };
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ROLE_GRANT_NOT_FOUND'
  ) {
    return {
      statusCode: 404,
      body: { code: 'ROLE_GRANT_NOT_FOUND', message: 'Role grant was not found', requestId },
    };
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'DISCOVERY_UNAVAILABLE'
  ) {
    return {
      statusCode: 403,
      body: {
        code: 'DISCOVERY_UNAVAILABLE',
        message: 'Discovery is unavailable for the current profile state',
        requestId,
      },
    };
  }
  const hasValidation =
    typeof error === 'object' &&
    error !== null &&
    'validation' in error &&
    error.validation !== undefined;
  if (error instanceof InvalidCommandEnvelopeError || hasValidation) {
    return {
      statusCode: 400,
      body: { code: 'INVALID_REQUEST', message: 'Request is invalid', requestId },
    };
  }
  const transportStatus =
    typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    typeof error.statusCode === 'number'
      ? error.statusCode
      : null;
  if (transportStatus && transportStatus >= 400 && transportStatus < 500) {
    return {
      statusCode: transportStatus,
      body: {
        code: transportStatus === 415 ? 'UNSUPPORTED_MEDIA_TYPE' : 'INVALID_REQUEST',
        message:
          transportStatus === 415
            ? 'Content-Type is not supported'
            : 'Request could not be processed',
        requestId,
      },
    };
  }
  return {
    statusCode: 500,
    body: { code: 'INTERNAL_ERROR', message: 'Unexpected server error', requestId },
  };
}

export function registerRequestContext(app: FastifyInstance): void {
  app.decorateRequest('transportContext', null);

  app.addHook('onRequest', async (request) => {
    const suppliedRequestId = validHeaderId(request.headers['x-request-id']);
    const suppliedCorrelationId = validHeaderId(request.headers['x-correlation-id']);
    const requestId = suppliedRequestId ?? randomUUID();
    request.transportContext = Object.freeze({
      requestId,
      correlationId: suppliedCorrelationId ?? requestId,
      causationId: validHeaderId(request.headers['x-causation-id']),
    });
  });

  app.addHook('onSend', async (request, reply, payload) => {
    const context = requestContext(request);
    void reply.header('x-request-id', context.requestId);
    void reply.header('x-correlation-id', context.correlationId);
    if (context.causationId) void reply.header('x-causation-id', context.causationId);
    return payload;
  });

  app.addHook('onResponse', async (request, reply) => {
    const context = requestContext(request);
    request.log.info(
      {
        correlationId: context.correlationId,
        durationMilliseconds: Math.round(reply.elapsedTime),
        method: request.method,
        requestId: context.requestId,
        route: request.routeOptions.url,
        statusCode: reply.statusCode,
      },
      'request completed',
    );
  });

  app.setErrorHandler((error, request, reply) => {
    const fallbackRequestId = randomUUID();
    const context = request.transportContext ?? {
      requestId: fallbackRequestId,
      correlationId: fallbackRequestId,
      causationId: null,
    };
    const mapping = mapApiError(error, context.requestId);
    if (mapping.statusCode >= 500) {
      request.log.error(
        {
          correlationId: context.correlationId,
          err: error,
          requestId: context.requestId,
        },
        'request failed',
      );
    }
    return reply.status(mapping.statusCode).send(mapping.body);
  });
}
