import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProductRulesController } from './product-rules.controller';
import { ProductRulesService } from './product-rules.service';

@Module({
  imports: [AuthModule],
  controllers: [ProductRulesController],
  providers: [ProductRulesService],
})
export class ProductRulesModule {}
