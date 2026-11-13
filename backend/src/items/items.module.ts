import { Module } from '@nestjs/common';
import { LocationsService } from '../locations/locations.service.js';
import { ItemsController } from './items.controller.js';
import { ItemsPresenter } from './items.presenter.js';
import { ItemsService } from './items.service.js';

@Module({
  controllers: [ItemsController],
  providers: [ItemsService, ItemsPresenter, LocationsService],
  exports: [ItemsPresenter],
})
export class ItemsModule {}
