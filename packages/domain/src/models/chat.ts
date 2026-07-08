import type { ChatId, MemberId, MessageId, SenderType, ChatStatus } from '@gs-v2/shared';

export interface Chat {
  readonly id: ChatId;
  readonly memberId: MemberId;
  readonly title: string;
  readonly status: ChatStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface Message {
  readonly id: MessageId;
  readonly chatId: ChatId;
  readonly senderType: SenderType;
  readonly body: string;
  readonly sequence: number;
  readonly createdAt: string;
}

export interface AppendMessageInput {
  readonly chatId: ChatId;
  readonly senderType: SenderType;
  readonly body: string;
}
