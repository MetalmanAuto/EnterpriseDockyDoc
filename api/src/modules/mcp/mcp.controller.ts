import { All, Controller, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeController } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { DevAuthGuard, type DevUserPayload } from '../../common/guards/dev-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { ApiKeyContext } from '../api-keys/api-keys.service';
import { IntegrationsService } from '../integrations/integrations.service';

/**
 * DockyDoc as an MCP server, at POST /api/v1/mcp, authenticated with a
 * personal API key in the Authorization header like every other call.
 *
 * Stateless: each request builds a server for the caller and tears it down.
 * That costs a little per call and needs no session store, which suits an
 * API that mostly answers "get me my passport" a few times a day.
 */
@ApiExcludeController()
@ApiBearerAuth()
@Controller('mcp')
@UseGuards(DevAuthGuard)
export class McpController {
  constructor(private readonly integrations: IntegrationsService) {}

  @All()
  async handle(
    @Req() req: Request,
    @Res() res: Response,
    @CurrentUser() user: DevUserPayload,
  ): Promise<void> {
    const key = (req as Request & { apiKey?: ApiKeyContext }).apiKey;
    const server = this.buildServer(user, key);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  }

  private buildServer(user: DevUserPayload, key: ApiKeyContext | undefined): McpServer {
    const server = new McpServer({ name: 'dockydoc', version: '1.0.0' });
    const json = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] });

    server.registerTool(
      'whoami',
      { description: 'Who this API key belongs to, and the workspaces they can see.' },
      async () => json(this.integrations.me(user, key)),
    );

    server.registerTool(
      'find_documents',
      {
        description:
          'Work out which stored documents a plain-English request refers to, e.g. "my passport and UK visa". ' +
          'Returns one item per document asked for, each with the best match, a confidence from 0 to 1, and alternatives. ' +
          'Below 0.6 confidence, show the alternatives and ask the person which they meant.',
        inputSchema: {
          query: z.string().describe('The request in the person\'s own words'),
          workspaceId: z.string().optional().describe('Limit to one workspace; default is all of theirs'),
        },
      },
      async ({ query, workspaceId }) => json(await this.integrations.find(user, { query, workspaceId })),
    );

    server.registerTool(
      'get_download_links',
      {
        description:
          'Make short-lived download links for documents by id. The links need no login and stop working after expiresInMinutes (default 15).',
        inputSchema: {
          documentIds: z.array(z.string()).min(1).max(10),
          expiresInMinutes: z.number().int().min(1).max(1440).optional(),
        },
      },
      async ({ documentIds, expiresInMinutes }) =>
        json(await this.integrations.deliver(user, { documentIds, expiresInMinutes })),
    );

    server.registerTool(
      'fetch_documents',
      {
        description:
          'The one-step version: request in, download links out. Confident matches come back with a link; ' +
          'uncertain ones come back with needsChoice=true and alternatives to put to the person.',
        inputSchema: {
          query: z.string(),
          workspaceId: z.string().optional(),
          expiresInMinutes: z.number().int().min(1).max(1440).optional(),
        },
      },
      async ({ query, workspaceId, expiresInMinutes }) =>
        json(await this.integrations.fetch(user, { query, workspaceId, expiresInMinutes })),
    );

    server.registerTool(
      'upload_document',
      {
        description:
          'Store a file as a new document. Needs a key with write access. Content is base64. ' +
          'Labels are names, comma-separated, created if missing.',
        inputSchema: {
          fileName: z.string(),
          mimeType: z.string(),
          contentBase64: z.string(),
          name: z.string().optional(),
          description: z.string().optional(),
          labels: z.string().optional(),
          workspaceId: z.string().optional(),
        },
      },
      async ({ fileName, mimeType, contentBase64, name, description, labels, workspaceId }) => {
        const buffer = Buffer.from(contentBase64, 'base64');
        const file = {
          fieldname: 'file',
          originalname: fileName,
          encoding: '7bit',
          mimetype: mimeType,
          size: buffer.length,
          buffer,
        } as Express.Multer.File;
        return json(await this.integrations.upload(user, key, { name, description, labels, workspaceId }, file));
      },
    );

    return server;
  }
}
