import { HttpException, HttpStatus } from '@nestjs/common';
import type { WorkspacePlan } from '@prisma/client';

export type PlanLimitCode =
  | 'documents_limit'
  | 'workspaces_limit'
  | 'members_limit'
  | 'ai_actions_exhausted'
  | 'api_requires_business'
  | 'share_controls_require_paid'
  | 'cross_workspace_requires_business'
  | 'activity_export_requires_business'
  | 'top_ups_require_paid';

/**
 * 402 Payment Required: the account's plan does not allow this. The body
 * carries a machine-readable code and the plan that would, so the web app
 * can show an upgrade button instead of a generic error.
 */
export class PlanLimitException extends HttpException {
  constructor(
    public readonly code: PlanLimitCode,
    message: string,
    public readonly plan: WorkspacePlan,
    public readonly upgradeTo: WorkspacePlan | null,
  ) {
    super({ statusCode: HttpStatus.PAYMENT_REQUIRED, error: 'Plan limit', code, message, plan, upgradeTo }, HttpStatus.PAYMENT_REQUIRED);
  }
}
