export const RABBITMQ_OPTIONS = 'ORGANON_RABBITMQ_OPTIONS';

/** Where the broker is, and the exchange this service publishes to. */
export interface RabbitMqOptions {
  /** `amqp://user:pass@host:5672`, or a vhost URL. */
  uri: string;
  /**
   * The topic exchange events are published to and subscribed from.
   *
   * One exchange with routing keys rather than an exchange per event: a
   * consumer binds to `recording.*` and gets the ones it wants, and adding an
   * event needs no broker change.
   */
  exchange: string;
  /**
   * Messages a consumer may hold unacknowledged at once.
   *
   * Low on purpose. These events start slow work — transcription, embedding —
   * and a consumer that takes fifty of them has taken them away from every
   * other consumer without going any faster.
   */
  prefetch: number;
  /**
   * Wait for the broker before finishing the boot, in milliseconds. `false`
   * starts anyway and connects in the background.
   *
   * Waiting is right for a service whose work *is* the queue: failing the boot
   * says so plainly, where starting successfully and silently handling nothing
   * does not.
   */
  connectTimeoutMs: number | false;
}

export const defaultRabbitMqOptions: RabbitMqOptions = {
  uri: 'amqp://localhost:5672',
  exchange: 'aether-zone',
  prefetch: 1,
  connectTimeoutMs: 10_000,
};

export const withRabbitMqDefaults = (
  options: Partial<RabbitMqOptions> & Pick<RabbitMqOptions, 'uri'>,
): RabbitMqOptions => ({ ...defaultRabbitMqOptions, ...options });
