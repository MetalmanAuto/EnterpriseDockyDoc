/**
 * Opens the processor's own checkout in the browser. Razorpay (rupees) and
 * Paddle (dollars) both draw their own overlay; we only pass the session
 * the API created and report back when it finishes.
 */
import { confirmRazorpay, type CheckoutSession } from './billing';

type RazorpayResponse = { razorpay_payment_id: string; razorpay_subscription_id?: string; razorpay_order_id?: string; razorpay_signature: string };

interface RazorpayCtor {
  new (opts: Record<string, unknown>): { open: () => void; on: (event: string, cb: (r: unknown) => void) => void };
}
interface PaddleGlobal {
  Initialize: (opts: { token: string; environment?: 'sandbox' | 'production'; eventCallback?: (e: { name: string }) => void }) => void;
  Environment: { set: (env: 'sandbox' | 'production') => void };
  Checkout: { open: (opts: Record<string, unknown>) => void };
}

declare global {
  interface Window {
    Razorpay?: RazorpayCtor;
    Paddle?: PaddleGlobal;
  }
}

const loaded = new Map<string, Promise<void>>();

function loadScript(src: string): Promise<void> {
  if (!loaded.has(src)) {
    loaded.set(src, new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = src;
      el.async = true;
      el.onload = () => resolve();
      el.onerror = () => reject(new Error(`Could not load ${src}. Check ad blockers and try again.`));
      document.head.appendChild(el);
    }));
  }
  return loaded.get(src)!;
}

/**
 * Runs the checkout for a session. Resolves 'applied' when the plan or
 * top-up is already active, 'pending' when the processor will confirm by
 * webhook in a moment, and 'closed' when the person closed the overlay.
 */
export async function runCheckout(session: CheckoutSession): Promise<'applied' | 'pending' | 'closed'> {
  if (session.mode === 'updated') return 'applied';

  if (session.mode === 'razorpay') {
    await loadScript('https://checkout.razorpay.com/v1/checkout.js');
    if (!window.Razorpay) throw new Error('Razorpay did not load.');
    return new Promise((resolve, reject) => {
      const rzp = new window.Razorpay!({
        key: session.keyId,
        name: 'DockyDoc',
        description: session.description,
        ...(session.subscriptionId ? { subscription_id: session.subscriptionId } : { order_id: session.orderId, amount: session.amount, currency: session.currency }),
        prefill: { email: session.email, name: session.name },
        notes: {},
        theme: { color: '#0f766e' },
        modal: { ondismiss: () => resolve('closed') },
        handler: async (r: RazorpayResponse) => {
          try {
            const res = await confirmRazorpay({
              razorpay_payment_id: r.razorpay_payment_id,
              razorpay_subscription_id: r.razorpay_subscription_id,
              razorpay_order_id: r.razorpay_order_id,
              razorpay_signature: r.razorpay_signature,
            });
            resolve(res.applied === 'pending' ? 'pending' : 'applied');
          } catch (err) {
            reject(err);
          }
        },
      });
      rzp.on('payment.failed', (r: unknown) => {
        const msg = (r as { error?: { description?: string } })?.error?.description ?? 'Payment failed.';
        reject(new Error(msg));
      });
      rzp.open();
    });
  }

  await loadScript('https://cdn.paddle.com/paddle/v2/paddle.js');
  if (!window.Paddle) throw new Error('Paddle did not load.');
  return new Promise((resolve) => {
    const Paddle = window.Paddle!;
    Paddle.Initialize({
      token: session.clientToken,
      environment: session.env,
      eventCallback: (e) => {
        if (e.name === 'checkout.completed') resolve('pending');
        if (e.name === 'checkout.closed') resolve('closed');
      },
    });
    Paddle.Checkout.open({
      items: [{ priceId: session.priceId, quantity: 1 }],
      customer: { email: session.email },
      customData: session.customData,
      settings: { displayMode: 'overlay', theme: 'light', showAddDiscounts: false, allowLogout: false },
    });
  });
}
