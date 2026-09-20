import { BadRequestException, Body, Controller, Delete, Get, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { DevAuthGuard, type DevUserPayload } from '../../common/guards/dev-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AccountService } from './account.service';

class DeleteAccountDto {
  @IsString()
  confirm!: string;
}

@ApiTags('Account')
@Controller('account')
@UseGuards(DevAuthGuard)
export class AccountController {
  constructor(private readonly account: AccountService) {}

  @Get('export')
  @ApiOperation({ summary: 'Everything held about the signed-in person, as JSON' })
  export(@CurrentUser() user: DevUserPayload) {
    return this.account.exportAccount(user);
  }

  @Get('deletion-blockers')
  @ApiOperation({ summary: 'Owned workspaces with other members, which must be handed over before deletion' })
  blockers(@CurrentUser() user: DevUserPayload) {
    return this.account.deletionBlockers(user.id);
  }

  @Delete()
  @ApiOperation({ summary: 'Delete the account and everything only it owns. Body must carry confirm: "DELETE".' })
  remove(@CurrentUser() user: DevUserPayload, @Body() dto: DeleteAccountDto) {
    if (dto.confirm !== 'DELETE') throw new BadRequestException('Type DELETE to confirm');
    return this.account.deleteAccount(user);
  }
}
