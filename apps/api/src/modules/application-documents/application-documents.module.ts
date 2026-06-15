import { Module } from '@nestjs/common';
import { OwnershipGuard } from '../../common/guards/ownership.guard';
import { AuthModule } from '../auth/auth.module';
import { ApplicationDocumentsController } from './application-documents.controller';
import { ApplicationDocumentsService } from './application-documents.service';

@Module({
  imports: [AuthModule],
  controllers: [ApplicationDocumentsController],
  providers: [ApplicationDocumentsService, OwnershipGuard],
})
export class ApplicationDocumentsModule {}
