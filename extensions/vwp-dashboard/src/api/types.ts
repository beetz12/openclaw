export type PendingMessage = {
  id: string;
  to: string;
  content: string;
  edited_content: string | null;
  channel: string;
  session_key: string;
  agent_id: string;
  created_at: number;
  status: "pending" | "approved" | "rejected" | "auto_approved";
};

export type ApprovalStats = {
  channel: string;
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  auto_approved: number;
};

export type PendingListResponse = {
  messages: PendingMessage[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
};

export type StatsResponse = {
  stats: ApprovalStats[];
};

export type ApproveResult = {
  id: string;
  status: "approved";
  content: string;
  to: string;
  channel: string;
};

export type RejectResult = {
  id: string;
  status: "rejected";
  reason?: string;
};

export type SSEEvent =
  | { type: "message_queued"; message: PendingMessage }
  | { type: "message_approved"; id: string; content: string }
  | { type: "message_rejected"; id: string }
  | { type: "message_auto_approved"; message: PendingMessage }
  | { type: "connected"; ts: number };

export type ApiError = {
  error: string;
  status: number;
};
