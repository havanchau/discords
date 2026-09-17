import { Module } from '@nestjs/common';
import { AuthModule } from '@/modules/auth/auth.module';
import { PrivateFileStorageService } from './private-file-storage.service';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';

@Module({
  imports: [AuthModule],
  controllers: [UploadsController],
  providers: [UploadsService, PrivateFileStorageService],
  exports: [PrivateFileStorageService, UploadsService],
})
export class UploadsModule {}
