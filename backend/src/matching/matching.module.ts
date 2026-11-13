import { Module } from '@nestjs/common';
import { ItemsModule } from '../items/items.module.js';
import { FeedController } from './feed.controller.js';
import { FeedService } from './feed.service.js';

@Module({
  imports: [ItemsModule],
  controllers: [FeedController],
  providers: [FeedService],
})
export class MatchingModule {}
