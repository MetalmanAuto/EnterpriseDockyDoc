import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import type { OcrOutput, OcrProvider } from '../ocr-provider.interface';

/**
 * Claude Native OCR provider.
 *
 * Uses:
 *   - Claude Document API for PDFs (full layout fidelity)
 *   - Claude Vision API for images
 *   - pdf-parse for supplementary text extraction on PDFs
 *
 * Always available when ANTHROPIC_API_KEY is set.
 * This is the fallback provider when Azure DI and Mistral are unavailable.
 */
@Injectable()
export class ClaudeNativeProvider implements OcrProvider {
  readonly name = 'claude-native';
  private readonly logger = new Logger(ClaudeNativeProvider.name);

  private readonly client: Anthropic | null;

  private static readonly VISION_TYPES = new Set([
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
  ]);

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
    this.client = apiKey ? new Anthropic({ apiKey }) : null;
  }

  isAvailable(): boolean {
    return this.client !== null;
  }

  canHandle(mimeType: string): boolean {
    return (
      mimeType === 'application/pdf' ||
      ClaudeNativeProvider.VISION_TYPES.has(mimeType) ||
      mimeType.startsWith('text/') ||
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mimeType === 'application/msword'
    );
  }

  async extract(
    buffer: Buffer,
    mimeType: string,
    fileName: string,
  ): Promise<OcrOutput | null> {
    if (!this.client) return null;

    const start = Date.now();

    try {
      // Plain text — just decode
      if (
        mimeType.startsWith('text/') ||
        ['.txt', '.csv', '.md', '.json', '.xml'].some((ext) =>
          fileName.toLowerCase().endsWith(ext),
        )
      ) {
        const text = buffer.toString('utf-8').trim();
        return {
          provider: this.name,
          fullText: text,
          pages: [{ pageNumber: 1, text }],
          pageCount: 1,
          confidence: 1.0,
          processingTimeMs: Date.now() - start,
        };
      }

      // Word documents — use mammoth
      if (
        mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        mimeType === 'application/msword'
      ) {
        const text = await this.extractWord(buffer, fileName);
        if (text) {
          return {
            provider: this.name,
            fullText: text,
            pages: [{ pageNumber: 1, text }],
            pageCount: 1,
            confidence: 0.95,
            processingTimeMs: Date.now() - start,
          };
        }
        return null;
      }

      // PDF — Claude Document API for full fidelity
      if (mimeType === 'application/pdf') {
        return await this.extractPdf(buffer, fileName, start);
      }

      // Images — Claude Vision API
      if (ClaudeNativeProvider.VISION_TYPES.has(mimeType)) {
        return await this.extractImage(buffer, mimeType, fileName, start);
      }

      return null;
    } catch (err) {
      this.logger.warn(
        `Claude Native OCR error for ${fileName}: ${(err as Error).message}`,
      );
      return null;
    }
  }

  private async extractPdf(
    buffer: Buffer,
    fileName: string,
    start: number,
  ): Promise<OcrOutput | null> {
    // Claude's API rejects base64 payloads over ~20MB (PDF > 15MB encodes to ~20MB base64).
    // For large files, fall back to pdf-parse text-layer only.
    const MAX_PDF_BYTES = 15 * 1024 * 1024; // 15 MB
    if (buffer.length > MAX_PDF_BYTES) {
      this.logger.warn(
        `Claude Native: PDF "${fileName}" is ${(buffer.length / 1024 / 1024).toFixed(1)} MB — using pdf-parse text-layer only (no Vision)`,
      );
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pdfParse = require('pdf-parse') as (b: Buffer) => Promise<{ text: string; numpages: number }>;
        const parsed = await pdfParse(buffer);
        const fullText = parsed.text.trim();
        if (fullText.length > 10) {
          return {
            provider: `${this.name}-text-layer`,
            fullText,
            pages: [{ pageNumber: 1, text: fullText }],
            pageCount: parsed.numpages || 1,
            confidence: 0.80,
            processingTimeMs: Date.now() - start,
          };
        }
      } catch {
        // pdf-parse failed — nothing we can do for this large file
      }
      return null;
    }

    const fileBase64 = buffer.toString('base64');

    // Also get text from pdf-parse as supplementary context
    let parsedText = '';
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require('pdf-parse') as (b: Buffer) => Promise<{ text: string }>;
      const parsed = await pdfParse(buffer);
      parsedText = parsed.text.trim();
    } catch {
      // Non-fatal — Claude Document API alone is sufficient
    }

    const prompt = `Extract ALL text content from this document verbatim. Include every word, number, date, and label visible in the document. Preserve the document structure.

Output format: Just the extracted text, no commentary.${parsedText ? `\n\nSupplementary text-layer (use to verify your extraction):\n${parsedText.slice(0, 3000)}` : ''}`;

    const message = await this.client!.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: fileBase64,
              },
            } as Anthropic.DocumentBlockParam,
            { type: 'text', text: prompt },
          ],
        },
      ],
    });

    const content = message.content[0];
    if (content.type !== 'text') return null;

    const fullText = content.text.trim();
    if (!fullText) return null;

    this.logger.log(
      `Claude Native PDF OCR extracted ${fullText.length} chars from ${fileName} in ${Date.now() - start}ms`,
    );

    return {
      provider: this.name,
      fullText,
      pages: [{ pageNumber: 1, text: fullText }],
      pageCount: 1,
      confidence: 0.92,
      processingTimeMs: Date.now() - start,
    };
  }

  private async extractImage(
    buffer: Buffer,
    mimeType: string,
    fileName: string,
    start: number,
  ): Promise<OcrOutput | null> {
    const fileBase64 = buffer.toString('base64');
    const safeMediaType = ClaudeNativeProvider.VISION_TYPES.has(mimeType)
      ? (mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp')
      : 'image/jpeg';

    const message = await this.client!.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: safeMediaType,
                data: fileBase64,
              },
            },
            {
              type: 'text',
              text: 'Extract ALL text visible in this image, exactly as it appears. Include every word, number, date, label, and identifier. Preserve the layout structure as much as possible. Output only the extracted text, no commentary.',
            },
          ],
        },
      ],
    });

    const content = message.content[0];
    if (content.type !== 'text') return null;

    const fullText = content.text.trim();
    if (!fullText) return null;

    this.logger.log(
      `Claude Native Vision OCR extracted ${fullText.length} chars from ${fileName} in ${Date.now() - start}ms`,
    );

    return {
      provider: this.name,
      fullText,
      pages: [{ pageNumber: 1, text: fullText }],
      pageCount: 1,
      confidence: 0.9,
      processingTimeMs: Date.now() - start,
    };
  }

  private async extractWord(
    buffer: Buffer,
    fileName: string,
  ): Promise<string | null> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mammoth = require('mammoth') as {
        extractRawText: (opts: { buffer: Buffer }) => Promise<{ value: string }>;
      };
      const result = await mammoth.extractRawText({ buffer });
      return result.value.trim() || null;
    } catch (err) {
      this.logger.warn(
        `Word extraction error for ${fileName}: ${(err as Error).message}`,
      );
      return null;
    }
  }
}
