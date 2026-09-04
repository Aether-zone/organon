import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { Inject, Injectable } from '@nestjs/common';

import { baseEvent, type RabbitEvent } from './event.js';
import { RABBITMQ_OPTIONS, type RabbitMqOptions } from './rabbitmq.options.js';

/**
 * Publishes events onto the configured exchange, with the envelope filled in.
 *
 * A caller states the routing key and whatever its own event carries; the id,
 * the timestamp and the caller's token come from here, so no publisher has to
 * remember them and none of them can be spelled differently in two services.
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
   * `accessToken` is separate rather than part of `payload` so it cannot be
   * left out by a publisher that forgot — see {@link RabbitEvent.accessToken}
   * for what putting it on the bus costs.
   *
   * Published persistent: an event survives a broker restart, which is the
   * point of sending it rather than doing the work inline.
   */
  async publish<T extends object>(
    routingKey: string,
    payload: T,
    accessToken: string,
  ): Promise<void> {
    const event: T & RabbitEvent = {
      ...payload,
      ...baseEvent(accessToken),
    };

    await this.amqp.publish(this.options.exchange, routingKey, event, {
      persistent: true,
      messageId: event.id,
      timestamp: Date.parse(event.occurredAt),
    });
  }
}
