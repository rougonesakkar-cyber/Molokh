import { Type, type Static } from 'typebox';

export const HealthResponseSchema = Type.Object(
  {
    status: Type.Literal('ok'),
    service: Type.Literal('molokh-api'),
    contractVersion: Type.Literal(1),
  },
  { $id: 'HealthResponse' },
);

export type HealthResponse = Static<typeof HealthResponseSchema>;

export const ApiErrorSchema = Type.Object(
  {
    code: Type.String(),
    message: Type.String(),
    requestId: Type.Optional(Type.String()),
  },
  { $id: 'ApiError' },
);

export type ApiError = Static<typeof ApiErrorSchema>;

export const RuntimeProjectionSchema = Type.Object(
  {
    architecture: Type.Literal('modular-monolith'),
    apiTransport: Type.Literal('https+sse'),
    clients: Type.Tuple([
      Type.Literal('web'),
      Type.Literal('ios'),
      Type.Literal('android'),
    ]),
    database: Type.Literal('postgresql-18'),
  },
  { $id: 'RuntimeProjection' },
);

export type RuntimeProjection = Static<typeof RuntimeProjectionSchema>;

