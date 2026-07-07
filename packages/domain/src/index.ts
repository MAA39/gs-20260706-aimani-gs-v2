export { ok, err } from './result.js';
export type { Result } from './result.js';

export type { Member, CreateMemberInput } from './models/member.js';
export type { Chat, Message, CreateChatInput, AppendMessageInput } from './models/chat.js';
export type { AiRun, AiRunEvent, CreateQueuedRunInput, CompleteRunInput } from './models/ai-run.js';

export type { MemberRepository, MemberError } from './ports/member-repository.js';
export type { ChatRepository, ChatError } from './ports/chat-repository.js';
export type { AiRunRepository, AiRunError } from './ports/ai-run-repository.js';

export { startChat } from './use-cases/start-chat.js';
export type { StartChatDeps, StartChatOutput, StartChatError } from './use-cases/start-chat.js';

export { sendMessage } from './use-cases/send-message.js';
export type { SendMessageDeps, SendMessageOutput, SendMessageError, ChatNotOwned } from './use-cases/send-message.js';

export { listChatMessages } from './use-cases/list-chat-messages.js';
export type { ListChatMessagesDeps, ListChatMessagesError } from './use-cases/list-chat-messages.js';
