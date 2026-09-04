import { EventPublisher } from './event-publisher.js';
import { defaultRabbitMqOptions } from './rabbitmq.options.js';

/** What `AmqpConnection.publish` is called with. */
type PublishCall = [
  exchange: string,
  routingKey: string,
  body: Record<string, unknown> & { id: string; accessToken: string },
  options: { persistent?: boolean; messageId?: string },
];

function harness() {
  const publish = jest
    .fn<Promise<boolean>, PublishCall>()
    .mockResolvedValue(true);
  const publisher = new EventPublisher({ publish } as never, {
    ...defaultRabbitMqOptions,
    exchange: 'test-exchange',
  });

  return { publisher, publish };
}

describe('publish', () => {
  it('sends to the configured exchange under the routing key given', async () => {
    const { publisher, publish } = harness();

    await publisher.publish('recording.stored', { recordingId: 'r1' }, 'token');

    const [exchange, routingKey] = publish.mock.calls[0];

    expect(exchange).toBe('test-exchange');
    expect(routingKey).toBe('recording.stored');
  });

  it('wraps the payload in the envelope, token included', async () => {
    const { publisher, publish } = harness();

    await publisher.publish('recording.stored', { recordingId: 'r1' }, 'token');

    const [, , body] = publish.mock.calls[0];

    expect(body).toMatchObject({ recordingId: 'r1', accessToken: 'token' });
    expect(typeof body.id).toBe('string');
    expect(typeof body.occurredAt).toBe('string');
  });

  it('publishes persistent, so an event outlives a broker restart', async () => {
    const { publisher, publish } = harness();

    await publisher.publish('recording.stored', {}, 'token');

    const [, , , options] = publish.mock.calls[0];

    expect(options).toMatchObject({ persistent: true });
  });

  it('puts the event id on the message, so the broker and the body agree', async () => {
    const { publisher, publish } = harness();

    await publisher.publish('recording.stored', {}, 'token');

    const [, , body, options] = publish.mock.calls[0];

    expect(options.messageId).toBe(body.id);
  });

  it('cannot be talked out of the envelope by the payload', async () => {
    const { publisher, publish } = harness();

    // A payload with its own `accessToken` must not become the one sent.
    await publisher.publish(
      'recording.stored',
      { accessToken: 'someone-elses' },
      'the-callers',
    );

    const [, , body] = publish.mock.calls[0];

    expect(body.accessToken).toBe('the-callers');
  });
});
