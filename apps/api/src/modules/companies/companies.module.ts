import { Module } from '@nestjs/common';
import { OwnershipGuard } from '../../common/guards/ownership.guard';
import { AuthModule } from '../auth/auth.module';
import { CompaniesController } from './companies.controller';
import { CompaniesService } from './companies.service';

@Module({
  imports: [AuthModule],
  controllers: [CompaniesController],
  providers: [CompaniesService, OwnershipGuard],
})
export class CompaniesModule {}
