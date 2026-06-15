import { Module } from '@nestjs/common';
import { StatusHistoryService } from './status-history.service';

@Module({
  providers: [StatusHistoryService],
  exports: [StatusHistoryService],
})
export class StatusHistoryModule {}
