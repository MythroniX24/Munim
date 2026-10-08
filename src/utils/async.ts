/** Give the event loop a tick so long imports don't freeze the UI. */
export function yieldToUI(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}
