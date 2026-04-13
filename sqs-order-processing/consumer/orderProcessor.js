// Simulates real order processing steps: inventory check, payment, email.
// In production these would be real service/API calls.
// ~20% random failure rate lets you observe DLQ behavior without code changes.

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function processOrder(order) {
  console.log(`[Processor] Starting order: ${order.orderId}`);

  // Step 1 — inventory check (simulate 500ms)
  await sleep(500);
  console.log(`[Processor] Inventory checked for: ${order.item}`);

  // Step 2 — charge payment (simulate 800ms, fails ~20% of the time)
  if (Math.random() < 0.2) {
    throw new Error(`Payment failed for order ${order.orderId} — insufficient funds`);
  }
  await sleep(800);
  console.log(`[Processor] Payment charged for order: ${order.orderId}`);

  // Step 3 — send confirmation email (simulate 300ms)
  await sleep(300);
  console.log(`[Processor] Confirmation email sent to user: ${order.userId}`);

  console.log(`[Processor] Order COMPLETE: ${order.orderId}`);
  return { success: true, orderId: order.orderId };
}
