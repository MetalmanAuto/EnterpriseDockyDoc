import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { MailModule } from '../mail/mail.module';
import { InvitationsController } from './invitations.controller';
import { InvitationsService } from './invitations.service';

@Module({
  imports: [PrismaModule, MailModule],
  controllers: [InvitationsController],
  providers: [InvitationsService],
})
export class InvitationsModule {}
