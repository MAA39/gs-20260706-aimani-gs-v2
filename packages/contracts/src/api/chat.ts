export interface StartChatRequest {
  readonly message: string;
}

export interface StartChatResponse {
  readonly chatId: string;
  readonly messageId: string;
  readonly aiRunId: string;
}

export interface SendMessageRequest {
  readonly message: string;
}

export interface SendMessageResponse {
  readonly messageId: string;
  readonly aiRunId: string;
}

export interface MessageDto {
  readonly id: string;
  readonly chatId: string;
  readonly senderType: 'human' | 'ai' | 'system';
  readonly body: string;
  readonly sequence: number;
  readonly createdAt: string;
}

export interface ChatMessagesResponse {
  readonly chatId: string;
  readonly messages: readonly MessageDto[];
}
