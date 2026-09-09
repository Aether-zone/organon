import { RabbitMQModule as GolevelupRabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import { DynamicModule, Global, Module } from '@nestjs/common';

import { type AsyncModuleConfig } from '../config/async-module-config.js';
import { EventPublisher } from './event-publisher.js';
import {
  defaultRabbitMqOptions,
  RABBITMQ_OPTIONS,
  withRabbitMqDefaults,
  type RabbitMqOptions,
} from './rabbitmq.options.js';

/**
 * Publishing and consuming events over RabbitMQ.
 *
 * A thin wrapper over `@golevelup/nestjs-rabbitmq` rather than a replacement:
 * `@RabbitSubscribe`, `AmqpConnection` and everything else are that package's
 * and are used directly. What this adds is the part every aether-zone service
 * would otherwise write the same way — one topic exchange, a `RabbitEvent`
 * envelope carrying the caller's token, and a publisher that stamps it.
 *
 * ```ts
 * RabbitMqModule.registerAsync({
 *   inject: [ENV],
 *   useFactory: (env: Env) => ({ uri: env.RABBITMQ_URI }),
 * });
 * ```
 *
 * Consumers subscribe with the package's own decorator:
 *
 * ```ts
 * @RabbitSubscribe({
 *   exchange: 'aether-zone',
 *   routingKey: 'recording.stored',
 *   queue: 'transcription.recording-stored',
 * })
 * async onRecordingStored(event: RecordingStoredEvent) {}
 * ```
 *
 * The queue is named deliberately: an anonymous one is exclusive and vanishes
 * with the process, so a restart loses whatever arrived meanwhile.
 *
 * Global, because publishing is cross-cutting: any module may have something
 * to announce, and a feature module cannot import this one — it is configured
 * once at the root, and importing the bare class would give a second
 * connection with no configuration. Without `@Global` a publisher injected
 * anywhere but the root fails to resolve at boot, which is a startup crash
 * rather than something a unit test constructing the service directly would
 * ever see.
 */
@Global()
@Module({})
export class RabbitMqModule {
  static register(
    options: Partial<RabbitMqOptions> & Pick<RabbitMqOptions, 'uri'> = {
      uri: defaultRabbitMqOptions.uri,
    },
  ): DynamicModule {
    return RabbitMqModule.registerAsync({ useFactory: () => options });
  }

  static registerAsync(
    options: AsyncModuleConfig<
      Partial<RabbitMqOptions> & Pick<RabbitMqOptions, 'uri'>
    >,
  ): DynamicModule {
    const { imports = [], inject = [], useFactory } = options;

    return {
      module: RabbitMqModule,
      imports: [
        ...imports,
        GolevelupRabbitMQModule.forRootAsync({
          imports: imports as never[],
          inject: inject as never[],
          useFactory: async (...args: never[]) => {
            const resolved = withRabbitMqDefaults(await useFactory(...args));

            return {
              uri: resolved.uri,
              prefetchCount: resolved.prefetch,
              exchanges: [
                {
                  name: resolved.exchange,
                  // Topic, so a consumer binds to `recording.*` rather than
                  // being told about every event that will ever exist.
                  type: 'topic',
                  options: { durable: true },
                },
              ],
              connectionInitOptions:
                resolved.connectTimeoutMs === false
                  ? { wait: false }
                  : { wait: true, timeout: resolved.connectTimeoutMs },
            };
          },
        }),
      ],
      providers: [
        {
          provide: RABBITMQ_OPTIONS,
          useFactory: async (...args: never[]) =>
            withRabbitMqDefaults(await useFactory(...args)),
          inject: inject as never[],
        },
        EventPublisher,
      ],
      exports: [EventPublisher, RABBITMQ_OPTIONS, GolevelupRabbitMQModule],
    };
  }
}
