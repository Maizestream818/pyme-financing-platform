import { Module } from '@nestjs/common';
import { OwnershipGuard } from '../../common/guards/ownership.guard';
import { AuthModule } from '../auth/auth.module';
import { ApplicationDecisionsController } from './application-decisions.controller';
import { ApplicationDecisionsService } from './application-decisions.service';

@Module({
  imports: [AuthModule],
  controllers: [ApplicationDecisionsController],
  providers: [ApplicationDecisionsService, OwnershipGuard],
})
export class ApplicationDecisionsModule {}
