import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ApplicationMatchesController } from './application-matches.controller';
import { ApplicationMatchesService } from './application-matches.service';

@Module({
  imports: [AuthModule],
  controllers: [ApplicationMatchesController],
  providers: [ApplicationMatchesService],
})
export class ApplicationMatchesModule {}
