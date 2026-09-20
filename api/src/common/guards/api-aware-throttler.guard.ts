import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { API_KEY_PREFIX } from '../../modules/api-keys/api-keys.service';

/**
 * The per-IP throttle (100 requests a minute) protects the browser app and
 * anonymous traffic. Requests that carry an API key are governed instead by
 * the per-plan limit in ClerkAuthGuard (120 to 1,200 a minute per account),
 * and failed key attempts by a per-IP limit in the same guard, so they are
 * skipped here; otherwise the IP throttle would cap every plan at 100.
 */
@Injectable()
export class ApiAwareThrottlerGuard extends ThrottlerGuard {
  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string | undefined> }>();
    const auth = request.headers['authorization'];
    return typeof auth === 'string' && auth.startsWith(`Bearer ${API_KEY_PREFIX}`);
  }
}
