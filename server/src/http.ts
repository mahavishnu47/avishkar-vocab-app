/**
 * HTTP helpers shared by all routes. OWNER: Lane A (server).
 */
import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { ApiError, ApiErrorCode } from '@shabd/core';

export class HttpError extends Error {
  constructor(public status: number, public code: ApiErrorCode, message: string) {
    super(message);
  }
}

export const badRequest = (msg: string) => new HttpError(400, 'bad_request', msg);
export const unauthorized = (msg = 'Please log in') => new HttpError(401, 'unauthorized', msg);
export const forbidden = (msg = 'Not allowed') => new HttpError(403, 'forbidden', msg);
export const notFound = (msg = 'Not found') => new HttpError(404, 'not_found', msg);

/**
 * Typed handler: H<Params, ResponseBody, RequestBody, Query>.
 * Express 5 forwards rejected promises to the error handler, so handlers may be async and throw HttpError.
 */
export type H<P = Record<string, string>, ResB = unknown, ReqB = unknown, Q = Record<string, string | undefined>> =
  RequestHandler<P, ResB | ApiError, ReqB, Q>;

/** 501 stub used until a lane implements the endpoint. */
export function notImplemented(endpoint: string): RequestHandler {
  return (_req, res) => {
    const body: ApiError = { error: { code: 'not_implemented', message: `${endpoint} is not implemented yet` } };
    res.status(501).json(body);
  };
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } } satisfies ApiError);
    return;
  }
  console.error(err);
  res.status(500).json({ error: { code: 'internal', message: 'Something went wrong' } } satisfies ApiError);
};
