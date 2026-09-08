export class CommandError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CommandError';
  }
}
