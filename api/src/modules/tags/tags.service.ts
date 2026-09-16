import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  assertWorkspaceMembership,
  assertEditorOrAbove,
} from '../../common/helpers/workspace-access.helper';
import type { DevUserPayload } from '../../common/guards/dev-auth.guard';
import { CreateTagDto, MergeTagDto, TagResponseDto, UpdateTagDto } from './dto/tag.dto';

@Injectable()
export class TagsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find a tag in the workspace whose name matches, ignoring case and
   * surrounding space. "Insurance" and " insurance " are the same label.
   */
  private findByName(workspaceId: string, name: string, excludeId?: string) {
    return this.prisma.documentTag.findFirst({
      where: {
        workspaceId,
        name: { equals: name.trim(), mode: 'insensitive' },
        ...(excludeId && { id: { not: excludeId } }),
      },
    });
  }

  async findAll(workspaceId: string, user: DevUserPayload): Promise<TagResponseDto[]> {
    assertWorkspaceMembership(user, workspaceId);

    const tags = await this.prisma.documentTag.findMany({
      where: { workspaceId },
      orderBy: { name: 'asc' },
      include: { _count: { select: { documents: true } } },
    });

    return tags.map(({ _count, ...tag }) => ({
      ...tag,
      documentCount: _count.documents,
    }));
  }

  /**
   * Create a tag, or hand back the one that already carries this name.
   * Returning the existing tag rather than erroring keeps the AI's
   * "apply suggested tags" path from spawning near-duplicates.
   */
  async create(dto: CreateTagDto, user: DevUserPayload): Promise<TagResponseDto> {
    assertEditorOrAbove(user, dto.workspaceId);

    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Tag name cannot be empty.');

    const existing = await this.findByName(dto.workspaceId, name);
    if (existing) {
      return this.withCount(existing.id);
    }

    const created = await this.prisma.documentTag.create({
      data: {
        workspaceId: dto.workspaceId,
        name,
        color: dto.color ?? null,
      },
    });

    return { ...created, documentCount: 0 };
  }

  async update(id: string, dto: UpdateTagDto, user: DevUserPayload): Promise<TagResponseDto> {
    const tag = await this.prisma.documentTag.findUnique({ where: { id } });
    if (!tag) throw new NotFoundException(`Tag "${id}" not found`);
    assertEditorOrAbove(user, tag.workspaceId);

    const name = dto.name?.trim();
    if (dto.name !== undefined && !name) {
      throw new BadRequestException('Tag name cannot be empty.');
    }

    if (name) {
      const clash = await this.findByName(tag.workspaceId, name, id);
      if (clash) {
        throw new ConflictException(
          `A label called "${clash.name}" already exists. Merge them instead of renaming.`,
        );
      }
    }

    await this.prisma.documentTag.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(dto.color !== undefined && { color: dto.color }),
      },
    });

    return this.withCount(id);
  }

  /**
   * Fold `id` into `intoTagId`: every document carrying the source tag gets
   * the target tag, then the source is deleted. Documents that already carry
   * both keep one mapping.
   */
  async merge(id: string, dto: MergeTagDto, user: DevUserPayload): Promise<TagResponseDto> {
    if (id === dto.intoTagId) {
      throw new BadRequestException('Cannot merge a label into itself.');
    }

    const [source, target] = await Promise.all([
      this.prisma.documentTag.findUnique({ where: { id } }),
      this.prisma.documentTag.findUnique({ where: { id: dto.intoTagId } }),
    ]);

    if (!source) throw new NotFoundException(`Tag "${id}" not found`);
    if (!target) throw new NotFoundException(`Tag "${dto.intoTagId}" not found`);
    if (source.workspaceId !== target.workspaceId) {
      throw new BadRequestException('Both labels must belong to the same workspace.');
    }
    assertEditorOrAbove(user, source.workspaceId);

    await this.prisma.$transaction(async (tx) => {
      const mappings = await tx.documentTagMapping.findMany({
        where: { tagId: id },
        select: { documentId: true },
      });

      if (mappings.length > 0) {
        await tx.documentTagMapping.createMany({
          data: mappings.map((m) => ({ documentId: m.documentId, tagId: dto.intoTagId })),
          skipDuplicates: true,
        });
      }

      // Mappings for the source go with it
      await tx.documentTag.delete({ where: { id } });
    });

    return this.withCount(dto.intoTagId);
  }

  async delete(id: string, user: DevUserPayload): Promise<void> {
    const tag = await this.prisma.documentTag.findUnique({ where: { id } });
    if (!tag) throw new NotFoundException(`Tag "${id}" not found`);
    assertEditorOrAbove(user, tag.workspaceId);

    await this.prisma.documentTag.delete({ where: { id } });
  }

  private async withCount(id: string): Promise<TagResponseDto> {
    const tag = await this.prisma.documentTag.findUniqueOrThrow({
      where: { id },
      include: { _count: { select: { documents: true } } },
    });
    const { _count, ...rest } = tag;
    return { ...rest, documentCount: _count.documents };
  }
}
