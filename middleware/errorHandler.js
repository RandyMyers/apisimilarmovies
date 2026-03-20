function errorHandler(err, req, res, next) {
  // eslint-disable-next-line no-unused-vars
  const _next = next;

  const status = Number.isFinite(err?.statusCode) ? err.statusCode : 500;
  const message =
    typeof err?.message === 'string' && err.message.trim() ? err.message.trim() : 'Internal server error';

  // Avoid leaking stack traces to clients by default
  const payload = { error: message };
  if (process.env.NODE_ENV === 'development') payload.stack = err?.stack;

  res.status(status).json(payload);
}

module.exports = { errorHandler };

