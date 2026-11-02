const TOKEN = "{firstName}";
function truncate(value: string, limit: number) {
  return value.slice(0, limit).replace(/[\uD800-\uDBFF]$/u, "");
}
export function firstName(value: unknown): string {
  if (typeof value !== "string") return "there";
  const clean = value.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/gu, " ").trim();
  return truncate(clean.split(/\s+/u)[0] || "there", 24);
}
export function validNotificationTemplate(text: string): boolean {
  return !/[{}]/u.test(text.split(TOKEN).join(""));
}
export function personalizeNotification(title: string, body: string, name?: unknown) {
  const replacement = firstName(name);
  return { title: truncate(title.split(TOKEN).join(replacement), 120), body: truncate(body.split(TOKEN).join(replacement), 500) };
}
