import { Module } from '@nestjs/common';
import { ReminderService } from './reminder.service.js';
import { RemindersController } from './reminders.controller.js';

@Module({
  controllers: [RemindersController],
  providers: [ReminderService],
  exports: [ReminderService],
})
export class RemindersModule {}
