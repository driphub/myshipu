class ServiceError extends Error {
  constructor(code, message, status = 400, details) {
    super(message);
    this.name = 'ServiceError';
    this.code = code;
    this.status = status;
    if (details) this.details = details;
  }
}

module.exports = { ServiceError };
