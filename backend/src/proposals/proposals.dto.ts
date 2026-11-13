import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateProposalDto {
  /** One of MY items, offered in exchange. */
  @IsUUID()
  offeredItemId!: string;

  /** The other user's item I want. */
  @IsUUID()
  requestedItemId!: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || undefined : value))
  @IsString()
  @MaxLength(280)
  message?: string;
}

export const PROPOSAL_STATUSES = ['pending', 'accepted', 'declined', 'cancelled', 'unavailable', 'completed'] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export class ListProposalsQueryDto {
  @IsOptional()
  @IsIn(['received', 'sent'])
  box?: 'received' | 'sent';

  @IsOptional()
  @IsIn(PROPOSAL_STATUSES)
  status?: ProposalStatus;
}
