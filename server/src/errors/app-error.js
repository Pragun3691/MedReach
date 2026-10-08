export class AppError extends Error {
  constructor(status, code, message, details = null) {
    super(message)
    this.name = 'AppError'
    this.status = status
    this.code = code
    this.details = details
  }
}
