import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { Inject, Injectable } from '@nestjs/common';

import { baseEvent, type RabbitEvent } from './event.js';
import { RABBITMQ_OPTIONS, type RabbitMqOptions } from './rabbitmq.options.js';

/**
 * Publishes events onto the configured exchange, with the envelope filled in.
 *
 * A caller states the routing key and whatever its own event carries; the id
 * and the timestamp come from here, so no publisher has to remember them and
 * neither can be spelled differently in two services.
 */
@Injectable()
export class EventPublisher {
  constructor(
    private readonly amqp: AmqpConnection,
    @Inject(RABBITMQ_OPTIONS) private readonly options: RabbitMqOptions,
  ) {}

  /**
   * `payload` is whatever the event carries beyond the envelope.
   *
   * The envelope is spread last, so a payload cannot supply its own `id` or
   * `occurredAt` — those are this publisher's to state, and a caller that sets
   * them is describing a different message than the one the broker is told
   * about.
   *
   * Published persistent: an event survives a broker restart, which is the
   * point of sending it rather than doing the work inline.
   */
  async publish<T extends object>(
    routingKey: string,
    payload: T,
  ): Promise<void> {
    const event: T & RabbitEvent = {
      ...payload,
      ...baseEvent(),
    };

    await this.amqp.publish(this.options.exchange, routingKey, event, {
      persistent: true,
      messageId: event.id,
      timestamp: Date.parse(event.occurredAt),
    });
  }
}
