import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { DevUserPayload } from '../../common/guards/dev-auth.guard';
import { isPlatformAdmin } from '../../common/helpers/platform-admin';

/** Runs after DevAuthGuard; lets only the emails in PLATFORM_ADMIN_EMAILS through. */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ devUser?: DevUserPayload }>();
    if (!isPlatformAdmin(request.devUser?.email)) {
      throw new ForbiddenException('This page is only available to platform administrators');
    }
    return true;
  }
}
