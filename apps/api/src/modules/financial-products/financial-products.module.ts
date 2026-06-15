import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FinancialProductsController } from './financial-products.controller';
import { FinancialProductsService } from './financial-products.service';

@Module({
  imports: [AuthModule],
  controllers: [FinancialProductsController],
  providers: [FinancialProductsService],
})
export class FinancialProductsModule {}
