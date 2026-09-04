import { JsonLogger, type LogRecord } from './json-logger.js';
import { runWithRequestContext } from './request-context.js';

/** Captures records instead of writing them. */
function capture(
  options: Partial<ConstructorParameters<typeof JsonLogger>[0]> = {},
) {
  const records: LogRecord[] = [];
  const lines: string[] = [];
  const logger = new JsonLogger({
    level: 'verbose',
    ...options,
    write: (record, line) => {
      records.push(record);
      lines.push(line);
    },
  });

  return { logger, records, lines };
}

describe('JsonLogger', () => {
  it('writes one line of parseable JSON per record', () => {
    const { logger, lines } = capture();

    logger.log('started');

    expect(lines).toHaveLength(1);
    expect(lines[0]).not.toContain('\n');
    expect(JSON.parse(lines[0])).toMatchObject({
      level: 'log',
      message: 'started',
    });
  });

  it('stamps an ISO timestamp', () => {
    const { logger, records } = capture();

    logger.log('x');

    expect(new Date(records[0].time).toISOString()).toBe(records[0].time);
  });

  it('honours the level threshold', () => {
    const { logger, records } = capture({ level: 'warn' });

    logger.verbose('no');
    logger.debug('no');
    logger.log('no');
    logger.warn('yes');
    logger.error('yes');
    logger.fatal('yes');

    expect(records.map((r) => r.level)).toEqual(['warn', 'error', 'fatal']);
  });

  it('writes the base fields onto every record', () => {
    const { logger, records } = capture({ base: { service: 'akouo' } });

    logger.log('x');

    expect(records[0].service).toBe('akouo');
  });

  it('reads a trailing string as the context', () => {
    const { logger, records } = capture();

    // How Nest's `Logger` calls a LoggerService.
    logger.log('mapped route', 'RouterExplorer');

    expect(records[0].context).toBe('RouterExplorer');
    expect(records[0].message).toBe('mapped route');
  });

  it('tells a stack from a context by its newlines', () => {
    const { logger, records } = capture();
    const stack = 'Error: boom\n    at thing (file.ts:1:1)';

    logger.error('failed', stack);
    logger.error('failed', 'UserService');

    expect(records[0].stack).toBe(stack);
    expect(records[0].context).toBeUndefined();
    expect(records[1].context).toBe('UserService');
    expect(records[1].stack).toBeUndefined();
  });

  it('takes both, in Nest order', () => {
    const { logger, records } = capture();

    logger.error('failed', 'Error: boom\n  at x', 'UserService');

    expect(records[0].stack).toBe('Error: boom\n  at x');
    expect(records[0].context).toBe('UserService');
  });

  it('spreads an object message into fields', () => {
    const { logger, records } = capture();

    logger.log({ message: 'charged', userId: 7, amount: 250 });

    expect(records[0]).toMatchObject({
      message: 'charged',
      userId: 7,
      amount: 250,
    });
  });

  it('takes an Error as the message and keeps its stack', () => {
    const { logger, records } = capture();

    logger.error(new Error('boom'));

    expect(records[0].message).toBe('boom');
    expect(String(records[0].stack)).toContain('boom');
  });

  it('carries the request id when one is in scope', () => {
    const { logger, records } = capture();

    runWithRequestContext({ requestId: 'req-123' }, () => {
      logger.log('inside');
    });
    logger.log('outside');

    expect(records[0].requestId).toBe('req-123');
    expect(records[1].requestId).toBeUndefined();
  });

  it('survives a record that cannot be serialised', () => {
    const { logger, lines } = capture();
    const circular: Record<string, unknown> = { message: 'loop' };
    circular.self = circular;

    expect(() => logger.log(circular)).not.toThrow();
    expect(JSON.parse(lines[0])).toMatchObject({
      message: 'loop',
      logError: 'This record could not be serialised.',
    });
  });

  it('sends errors to stderr and everything else to stdout', () => {
    const out = jest.spyOn(process.stdout, 'write').mockReturnValue(true);
    const err = jest.spyOn(process.stderr, 'write').mockReturnValue(true);
    const logger = new JsonLogger({ level: 'verbose' });

    logger.log('routine');
    logger.error('bad');
    logger.fatal('worse');

    expect(out).toHaveBeenCalledTimes(1);
    expect(err).toHaveBeenCalledTimes(2);

    jest.restoreAllMocks();
  });
});
