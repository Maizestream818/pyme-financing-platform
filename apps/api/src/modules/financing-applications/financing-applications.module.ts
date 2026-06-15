import { Module } from '@nestjs/common';
import { OwnershipGuard } from '../../common/guards/ownership.guard';
import { AuthModule } from '../auth/auth.module';
import { StatusHistoryModule } from '../status-history/status-history.module';
import { FinancingApplicationsController } from './financing-applications.controller';
import { FinancingApplicationsService } from './financing-applications.service';

@Module({
  imports: [AuthModule, StatusHistoryModule],
  controllers: [FinancingApplicationsController],
  providers: [FinancingApplicationsService, OwnershipGuard],
})
export class FinancingApplicationsModule {}
