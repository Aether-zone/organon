import { defineConfig } from 'tsup';

export default defineConfig({
  /*
   * One entry point. `tsup` skips an entry whose file is missing without
   * failing, so a stale path here builds green and ships nothing — keep this
   * list and `exports` in package.json in step.
   */
  entry: ['src/index.ts'],
  tsconfig: 'tsconfig.build.json',
  // A Nest application generated today is still CommonJS — `nest new` emits no
  // `"type": "module"` — so an ESM-only build would be unusable by the most
  // likely consumer.
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  /*
   * Nest resolves providers by constructor type out of `emitDecoratorMetadata`,
   * so that metadata has to survive the build: `PistisJwtAuthGuard` takes a
   * bare `Reflector` and `ProblemExceptionFilter` a bare `HttpAdapterHost`,
   * neither with an explicit `@Inject`.
   *
   * It survives because `tsconfig.build.json` sets `experimentalDecorators`
   * and `emitDecoratorMetadata`, which makes tsup run the SWC decorator
   * transform rather than letting esbuild drop the metadata. Check
   * each entry's emitted `index.cjs` for `design:paramtypes` after changing
   * anything here.
   */
  external: [
    '@nestjs/common',
    '@nestjs/config',
    '@nestjs/core',
    '@nestjs/passport',
    'passport',
    'passport-jwt',
    'reflect-metadata',
    'rxjs',
    'zod',
  ],
  outDir: 'dist',
});
