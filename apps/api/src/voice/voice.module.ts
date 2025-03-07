import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module.js';
import { VoiceController } from './voice.controller.js';

@Module({ imports: [UsersModule], controllers: [VoiceController] })
export class VoiceModule {}
