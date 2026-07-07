import type { MemberId } from '@gs-v2/shared';
import type { Result } from '../result.js';
import { ok } from '../result.js';
import type { Chat } from '../models/chat.js';
import type { ChatRepository, ChatError } from '../ports/chat-repository.js';

export interface ListMemberChatsDeps {
  readonly chatRepo: ChatRepository;
}

export async function listMemberChats(
  deps: ListMemberChatsDeps,
  memberId: MemberId,
): Promise<Result<readonly Chat[], ChatError>> {
  const chatsResult = await deps.chatRepo.findByMember(memberId);
  if (!chatsResult.ok) return chatsResult;
  return ok(chatsResult.value);
}
