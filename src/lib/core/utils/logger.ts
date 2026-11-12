/**
 * Logger utility for colored console output with timestamps
 */
export class Logger {
  readonly colors = {
    blue: "\x1b[34m",
    cyan: "\x1b[36m",
    dim: "\x1b[2m",
    gray: "\x1b[90m",
    green: "\x1b[32m",
    orange: "\x1b[38;5;208m",
    red: "\x1b[31m",
    reset: "\x1b[0m",
    yellow: "\x1b[33m",
  };

  private readonly debugLevel: string;

  constructor() {
    this.debugLevel = process.env.DEBUG_LEVEL || "info";
  }

  private shouldLog(level: string): boolean {
    const levels: Record<string, number> = {
      debug: 0,
      error: 3,
      info: 1,
      warn: 2,
    };
    return levels[level] >= levels[this.debugLevel];
  }

  /**
   * Generate timestamp in format: [hh:mm:ss]
   */
  private getTimestamp(): string {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const seconds = String(now.getSeconds()).padStart(2, "0");

    return `[${hours}:${minutes}:${seconds}]`;
  }

  log(message: string, color = this.colors.reset): void {
    if (this.shouldLog("info")) {
      console.log(this.formatMessage(message, color));
    }
  }

  debug(message: string, color = this.colors.dim): void {
    if (this.shouldLog("debug")) {
      console.debug(this.formatMessage(message, color));
    }
  }

  info(message: string): void {
    if (this.shouldLog("info")) {
      console.info(this.formatMessage(message, this.colors.green));
    }
  }

  warn(message: string, parameter?: unknown): void {
    console.warn(this.formatMessage(message, this.colors.orange));
    if (parameter) {
      const serialized = this.serializeParameter(parameter);
      console.warn(`\t${this.formatMessage(`${message} - ${serialized}`, this.colors.orange)}`);
    }
  }

  error(message: string, error?: unknown): void {
    console.error(this.formatMessage(message, this.colors.red));
    if (error) {
      console.error(`${this.getTimestamp()} ${this.formatError(error)}`);
    }
  }

  private formatMessage(message: string, color: string): string {
    return `${this.getTimestamp()} ${color}${message}${this.colors.reset}`;
  }

  private formatError(error: unknown): string {
    if (error instanceof Error) {
      return error.stack || error.message;
    }
    return this.serializeParameter(error);
  }

  /**
   * Serialize parameter to string, properly handling objects
   */
  private serializeParameter(parameter: unknown): string {
    if (parameter === null) {
      return "null";
    }
    if (parameter === undefined) {
      return "undefined";
    }
    if (typeof parameter === "string") {
      return parameter;
    }
    if (typeof parameter === "number" || typeof parameter === "boolean") {
      return String(parameter);
    }
    if (parameter instanceof Error) {
      return parameter.message;
    }

    // For objects and arrays, use JSON.stringify
    try {
      return JSON.stringify(parameter, null, 2);
    } catch {
      // Fallback if JSON.stringify fails (circular references, etc.)
      return String(parameter);
    }
  }
}

export const logger = new Logger();
