/**
 * One JSON line per event on stdout/stderr. Callers pass only job ids, phases
 * and error summaries: never the service token, never a photo's publicId (an
 * unguessable link), never guest data.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";
export type Logger = Record<LogLevel, (msg: string, fields?: Record<string, unknown>) => void>;

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export function createLogger(level: LogLevel = "info", write: (line: string, level: LogLevel) => void = defaultWrite): Logger {
  const at = (l: LogLevel) => (msg: string, fields: Record<string, unknown> = {}) => {
    if (ORDER[l] < ORDER[level]) return;
    write(JSON.stringify({ time: new Date().toISOString(), level: l, msg, ...fields }), l);
  };
  return { debug: at("debug"), info: at("info"), warn: at("warn"), error: at("error") };
}

function defaultWrite(line: string, level: LogLevel) {
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
}

/** Error text safe to log and to send to the API: one line, no URLs with query strings, bounded. */
export function summarize(err: unknown, max = 300): string {
  const text = err instanceof Error ? err.message : String(err);
  return text.replace(/\s+/g, " ").replace(/\?\S*/g, "?…").slice(0, max);
}

export const silentLogger: Logger = createLogger("error", () => {});
