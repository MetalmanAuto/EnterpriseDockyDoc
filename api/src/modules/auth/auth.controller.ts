import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiProperty, ApiResponse, ApiTags } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { AuthService } from './auth.service';
import { DevAuthGuard, type DevUserPayload } from '../../common/guards/dev-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  MeResponseDto,
  SwitchWorkspaceDto,
  SwitchWorkspaceResponseDto,
  WorkspaceMembershipDto,
} from './dto/auth.dto';

// ------------------------------------------------------------------ //
// Inline DTOs for the stubbed login endpoint
// ------------------------------------------------------------------ //

class AttributionDto {
  @ApiProperty({ description: 'e.g. "source=linkedin&campaign=launch" or "ref=news.ycombinator.com"' })
  @IsString()
  @MaxLength(300)
  source!: string;
}

class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

// ------------------------------------------------------------------ //
// Controller
// ------------------------------------------------------------------ //

const DEV_HEADER = ApiHeader({
  name: 'x-dev-user-email',
  description:
    'DEV ONLY — email of the user to impersonate. Defaults to alice@acmecorp.com. Remove when real JWT auth is implemented.',
  required: false,
  example: 'alice@acmecorp.com',
});

/**
 * Auth endpoints.
 * Routes: /api/v1/auth/*
 */
@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ------------------------------------------------------------------ //
  // Dev-safe current-user endpoints
  // ------------------------------------------------------------------ //

  /**
   * GET /api/v1/auth/me
   *
   * Returns the current user with all workspace memberships.
   * Resolves user from x-dev-user-email header (defaults to alice@acmecorp.com).
   */
  @Get('me')
  @UseGuards(DevAuthGuard)
  @DEV_HEADER
  @ApiOperation({ summary: 'Get current user with workspace memberships' })
  @ApiResponse({ status: 200, type: MeResponseDto })
  @ApiResponse({ status: 401, description: 'Dev user not found in database' })
  me(@CurrentUser() user: DevUserPayload): MeResponseDto {
    return this.authService.getMe(user);
  }

  /**
   * POST /api/v1/auth/attribution
   *
   * Records where a sign-up came from (the dd_source cookie the marketing
   * pages set from utm tags or the referrer). Written once; later calls
   * are ignored so an ad click after sign-up cannot rewrite it.
   */
  @Post('attribution')
  @UseGuards(DevAuthGuard)
  @ApiOperation({ summary: 'Record the sign-up source once' })
  async attribution(@CurrentUser() user: DevUserPayload, @Body() dto: AttributionDto): Promise<{ recorded: boolean }> {
    return this.authService.recordAttribution(user.id, dto.source);
  }

  /**
   * GET /api/v1/auth/workspaces
   *
   * Returns workspace memberships of the current user.
   */
  @Get('workspaces')
  @UseGuards(DevAuthGuard)
  @DEV_HEADER
  @ApiOperation({ summary: 'Get current user workspace memberships' })
  @ApiResponse({ status: 200, type: [WorkspaceMembershipDto] })
  myWorkspaces(@CurrentUser() user: DevUserPayload): WorkspaceMembershipDto[] {
    return this.authService.getUserWorkspaces(user);
  }

  /**
   * POST /api/v1/auth/switch-workspace
   *
   * Validates that the current user belongs to the given workspace
   * and returns the workspace + role context.
   * The client stores the active workspace in localStorage.
   */
  @Post('switch-workspace')
  @HttpCode(HttpStatus.OK)
  @UseGuards(DevAuthGuard)
  @DEV_HEADER
  @ApiOperation({ summary: 'Switch active workspace' })
  @ApiResponse({ status: 200, type: SwitchWorkspaceResponseDto })
  @ApiResponse({ status: 403, description: 'User does not belong to workspace' })
  switchWorkspace(
    @CurrentUser() user: DevUserPayload,
    @Body() dto: SwitchWorkspaceDto,
  ): SwitchWorkspaceResponseDto {
    return this.authService.switchWorkspace(user, dto.workspaceId);
  }

  // ------------------------------------------------------------------ //
  // Login / Logout
  // ------------------------------------------------------------------ //

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log in with email and password' })
  @ApiResponse({ status: 200, description: 'Returns JWT access token' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(@Body() dto: LoginDto) {
    const user = await this.authService.validateUser(dto.email, dto.password);
    if (!user) throw new UnauthorizedException('Invalid email or password');
    return this.authService.login(user.id);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log out (client clears token)' })
  logout() {
    // JWT is stateless — client simply discards the token
    return { message: 'Logged out successfully' };
  }
}
