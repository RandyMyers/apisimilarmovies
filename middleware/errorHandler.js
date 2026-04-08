function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function errorHandler(err, req, res, next) {
  // eslint-disable-next-line no-unused-vars
  const _next = next;

  const status = Number.isFinite(err?.statusCode) ? err.statusCode : 500;
  const message =
    typeof err?.message === 'string' && err.message.trim() ? err.message.trim() : 'Internal server error';

  const payload = {
    error: message,
    message,
    success: status < 400,
  };
  if (status >= 400) payload.success = false;
  if (process.env.NODE_ENV === 'development') payload.stack = err?.stack;

  res.status(status).json(payload);
}

module.exports = { errorHandler, asyncHandler };

