import helmet from 'helmet';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { McpModule } from './modules/mcp/mcp.module';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

async function bootstrap() {
  // ------------------------------------------------------------------ //
  // Auth mode — drives both CORS and the auth guard.
  // When CLERK_SECRET_KEY is present, Clerk JWT verification is active.
  // When absent, the x-dev-user-email dev-fallback header is used instead.
  // ------------------------------------------------------------------ //
  const isProduction = process.env.NODE_ENV === 'production';
  const isClerkConfigured = Boolean(process.env.CLERK_SECRET_KEY);

  if (isProduction) {
    const required = [
      'DATABASE_URL',
      'CORS_ORIGINS',
      'SHARE_GRANT_SECRET',
      'ENCRYPTION_KEY',
      // CLERK_SECRET_KEY is intentionally optional here — omit it to keep the
      // x-dev-user-email dev-fallback active even in production (useful for
      // staging / initial bring-up before Clerk is wired in).
    ];
    const missing = required.filter((k) => !process.env[k]);
    if (missing.length > 0) {
      console.error(
        `FATAL: Missing required environment variables: ${missing.join(', ')}`,
      );
      process.exit(1);
    }
  }

  console.log(`Auth mode: ${isClerkConfigured ? 'Clerk JWT (CLERK_SECRET_KEY set)' : 'dev x-dev-user-email fallback (no CLERK_SECRET_KEY)'}`);

  // rawBody keeps the exact bytes so payment webhooks can verify their signatures.
  const app = await NestFactory.create(AppModule, { rawBody: true });

  const port = process.env.PORT ?? 8081;
  // CORS_ORIGINS is a comma-separated list of exact origins OR wildcard patterns.
  // Wildcard (*) matches any sequence of non-dot characters within a single domain
  // segment.  Example value for Render:
  //   https://enterprise-docky-doc.vercel.app,
  //   https://enterprise-docky-doc-git-main-nishant0127s-projects.vercel.app,
  //   https://enterprise-docky-*-nishant0127s-projects.vercel.app
  const corsOrigins = process.env.CORS_ORIGINS?.split(',').map((o) => o.trim()) ?? [
    'http://localhost:8080',
  ];

  console.log(`CORS allowed origins: ${corsOrigins.join(', ')}`);

  // ------------------------------------------------------------------ //
  // Global prefix — all routes under /api/v1
  // ------------------------------------------------------------------ //
  app.setGlobalPrefix('api/v1');

  // ------------------------------------------------------------------ //
  // CORS
  // ------------------------------------------------------------------ //
  const allowedHeaders = ['Content-Type', 'Authorization'];
  // x-dev-user-email must be allowed in CORS whenever the auth guard accepts it
  // (i.e. when CLERK_SECRET_KEY is absent).  Using CLERK_SECRET_KEY — not NODE_ENV —
  // keeps the CORS policy in sync with the ClerkAuthGuard's own decision.
  if (!isClerkConfigured) {
    allowedHeaders.push('x-dev-user-email');
  }

  /**
   * Match an incoming origin against the allowed-origins list.
   * Entries may contain a single `*` wildcard that matches any sequence of
   * characters except `.` — so "https://enterprise-docky-*-nishant0127s-projects.vercel.app"
   * covers all Vercel preview/hash deployments without opening the door to
   * unrelated vercel.app sites.
   */
  function isOriginAllowed(origin: string, allowed: string[]): boolean {
    return allowed.some((entry) => {
      if (!entry.includes('*')) return entry === origin;
      // Escape regex special chars, then replace * with [^.]+ (no dots)
      const pattern = entry
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '[^.]+');
      return new RegExp(`^${pattern}$`).test(origin);
    });
  }

  // Standard security headers. CSP is left to the web app, which knows its own sources;
  // files are fetched cross-origin by the web app, so the resource policy allows it.
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (server-to-server, health checks)
      if (!origin) return callback(null, true);
      if (isOriginAllowed(origin, corsOrigins)) return callback(null, true);
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders,
  });

  // ------------------------------------------------------------------ //
  // Global pipes — validate & transform all incoming DTOs
  // ------------------------------------------------------------------ //
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,       // Strip unknown properties
      forbidNonWhitelisted: true, // Throw on unknown properties
      transform: true,       // Auto-transform to DTO class instances
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // ------------------------------------------------------------------ //
  // Global filters & interceptors
  // ------------------------------------------------------------------ //
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  // ------------------------------------------------------------------ //
  // API reference at /api/docs (Swagger UI) and /api/docs-json (OpenAPI 3).
  // In production only the public integration surface is published; the
  // full internal document is for local development.
  // ------------------------------------------------------------------ //
  const publicConfig = new DocumentBuilder()
    .setTitle('DockyDoc API')
    .setDescription(
      'Find, fetch and store documents from your own software. Make a key in DockyDoc under Settings → Integrations and send it as `Authorization: Bearer dd_live_…`. Every call acts as the key\'s owner. Read-only keys can find and download; write access is needed to upload. The guide with examples is at https://dockydoc.app/developers.',
    )
    .setVersion('1.0')
    .setContact('DockyDoc support', 'https://dockydoc.app/developers', 'support@dockydoc.app')
    .addServer('https://dockydoc.app', 'Production')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'dd_live_… API key', description: 'A personal API key from Settings → Integrations' }, 'api-key')
    .build();
  const publicDocument = SwaggerModule.createDocument(app, publicConfig, { include: [IntegrationsModule, McpModule] });
  SwaggerModule.setup('api/docs', app, publicDocument, {
    customSiteTitle: 'DockyDoc API reference',
    swaggerOptions: { persistAuthorization: true, defaultModelsExpandDepth: 1 },
  });

  if (!isProduction) {
    const fullConfig = new DocumentBuilder()
      .setTitle('DockyDoc API (internal)')
      .setDescription('Every endpoint, including the ones the web app uses. Local development only.')
      .setVersion('1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
      .build();
    SwaggerModule.setup('api/docs/internal', app, SwaggerModule.createDocument(app, fullConfig), { swaggerOptions: { persistAuthorization: true } });
    console.log(`Swagger docs  → http://localhost:${port}/api/docs (public) and /api/docs/internal (everything)`);
  }

  // ------------------------------------------------------------------ //
  // Start
  // ------------------------------------------------------------------ //
  // Listen on 0.0.0.0 so Render (and other cloud hosts) can route traffic in.
  // Listening on 127.0.0.1 (the NestJS default) is invisible outside the container.
  await app.listen(port, '0.0.0.0');
  console.log(`DockyDoc API  → http://0.0.0.0:${port}`);
  console.log(`Health check  → http://0.0.0.0:${port}/api/v1/health`);
}

bootstrap();
