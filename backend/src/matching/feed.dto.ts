import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class FeedQueryDto {
  /** Which of my items to find matches for. Defaults to my most recent active item. */
  @IsOptional()
  @IsUUID()
  myItemId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500) // hard ceiling; the effective maximum is FEED_MAX_RADIUS_KM
  radiusKm?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  cursor?: string;
}
