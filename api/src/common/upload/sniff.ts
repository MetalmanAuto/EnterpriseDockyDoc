import { BadRequestException } from '@nestjs/common';
import { fromBuffer } from 'file-type';

/**
 * Checks that a file is what it says it is. The browser's declared MIME
 * type is only a claim; this reads the first bytes. Executables, scripts
 * and HTML dressed up as documents are refused, and a declared type that
 * does not match the real one is refused too.
 */
const DANGEROUS = new Set([
  'application/x-msdownload', 'application/x-dosexec', 'application/x-executable', 'application/x-elf',
  'application/x-mach-binary', 'application/x-sh', 'application/x-shockwave-flash', 'application/java-archive',
  'application/vnd.microsoft.portable-executable', 'application/x-ms-shortcut', 'application/x-msi',
]);

/** Declared type → real types it may legitimately be. */
const COMPATIBLE: Record<string, string[]> = {
  'application/pdf': ['application/pdf'],
  'image/jpeg': ['image/jpeg'],
  'image/jpg': ['image/jpeg'],
  'image/png': ['image/png'],
  'image/gif': ['image/gif'],
  'image/webp': ['image/webp'],
  'application/zip': ['application/zip'],
  // Office files are zips inside; older ones are OLE containers.
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/zip'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/zip'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/zip'],
  'application/msword': ['application/x-cfb', 'application/msword'],
  'application/vnd.ms-excel': ['application/x-cfb', 'application/vnd.ms-excel'],
  'application/vnd.ms-powerpoint': ['application/x-cfb', 'application/vnd.ms-powerpoint'],
};

const HTML_START = /^\s*<(!doctype\s+html|html|script|iframe)/i;

export async function assertSafeUpload(buffer: Buffer, declaredMime: string, fileName: string): Promise<void> {
  if (buffer.length === 0) throw new BadRequestException('The file is empty.');
  const detected = await fromBuffer(buffer);
  const real = detected?.mime ?? null;

  if (real && DANGEROUS.has(real)) {
    throw new BadRequestException(`"${fileName}" is a program, not a document, and cannot be stored.`);
  }

  const expected = COMPATIBLE[declaredMime];
  if (expected) {
    if (!real) {
      throw new BadRequestException(`"${fileName}" does not look like a ${label(declaredMime)} file. Check the file and try again.`);
    }
    if (!expected.includes(real)) {
      throw new BadRequestException(`"${fileName}" is declared as ${label(declaredMime)} but its contents are ${real}. Rename or convert the file and try again.`);
    }
    return;
  }

  // Text-like declared types must not carry a binary or a web page.
  if (declaredMime.startsWith('text/') || declaredMime === 'application/json' || declaredMime === 'application/octet-stream') {
    if (real && !real.startsWith('text/')) {
      throw new BadRequestException(`"${fileName}" contains ${real} data but was sent as ${declaredMime}.`);
    }
    if (HTML_START.test(buffer.subarray(0, 512).toString('utf8'))) {
      throw new BadRequestException(`"${fileName}" is a web page, which cannot be stored as a document.`);
    }
  }
}

function label(mime: string): string {
  if (mime === 'application/pdf') return 'PDF';
  if (mime.startsWith('image/')) return mime.slice(6).toUpperCase();
  if (mime.includes('wordprocessingml') || mime === 'application/msword') return 'Word';
  if (mime.includes('spreadsheetml') || mime === 'application/vnd.ms-excel') return 'Excel';
  if (mime.includes('presentationml') || mime === 'application/vnd.ms-powerpoint') return 'PowerPoint';
  if (mime === 'application/zip') return 'ZIP';
  return mime;
}
