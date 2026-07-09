export type AiRunProgressEvent =
  | { type: 'status_changed'; aiRunId: string; status: string; timestamp: string }
  | { type: 'token'; aiRunId: string; content: string }
  | { type: 'completed'; aiRunId: string; messageId: string; timestamp: string }
  | { type: 'failed'; aiRunId: string; error: string; timestamp: string };
