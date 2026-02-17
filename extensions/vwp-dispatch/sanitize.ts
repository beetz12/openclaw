const MAX_TASK_TEXT_LENGTH = 10_000;

export function sanitizeTaskText(text: string): string {
  let cleaned = text.replace(/\0/g, "");
  cleaned = cleaned.trim();
  if (cleaned.length === 0) {
    throw new Error("Task text is empty after sanitization");
  }
  if (cleaned.length > MAX_TASK_TEXT_LENGTH) {
    cleaned = cleaned.slice(0, MAX_TASK_TEXT_LENGTH);
  }
  return cleaned;
}
