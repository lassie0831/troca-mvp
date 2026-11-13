import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser, type AuthUser } from '../common/auth.decorators.js';
import { FeedQueryDto } from './feed.dto.js';
import { FeedService } from './feed.service.js';

@Controller('feed')
export class FeedController {
  constructor(private readonly feed: FeedService) {}

  @Get()
  get(@CurrentUser() user: AuthUser, @Query() query: FeedQueryDto) {
    return this.feed.feed(user.id, query);
  }
}
