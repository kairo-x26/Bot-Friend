import type { VerifyPurchase } from '@bot-friend/shared';
import * as Crypto from 'expo-crypto';
import * as IAP from 'expo-iap';
import { Platform } from 'react-native';

export type PlanId = VerifyPurchase['productId'];

export interface Plan {
  id: PlanId;
  title: string;
  price: string;
  note: string;
}

const FALLBACK: Record<PlanId, Omit<Plan, 'id'>> = {
  'botfriend.premium.monthly': {
    title: 'Monthly',
    price: '$4.99',
    note: 'per month, cancel any time',
  },
  'botfriend.premium.yearly': {
    title: 'Yearly',
    price: '$39.99',
    note: 'per year, about $3.33 a month',
  },
};
const PLAN_IDS = Object.keys(FALLBACK) as PlanId[];

/** In dev builds and on web there is no store; purchases use `test:` receipts the API accepts outside production. */
export const usingTestStore = __DEV__ || Platform.OS === 'web';
const provider: VerifyPurchase['provider'] = Platform.OS === 'ios' ? 'apple' : 'google';

let connected = false;
async function connect() {
  if (!connected) {
    await IAP.initConnection();
    connected = true;
  }
}

export async function loadPlans(): Promise<Plan[]> {
  if (usingTestStore) return PLAN_IDS.map((id) => ({ id, ...FALLBACK[id] }));
  await connect();
  const products = ((await IAP.fetchProducts({ skus: PLAN_IDS, type: 'subs' })) ?? []) as Array<{
    id: string;
    displayPrice: string;
  }>;
  return PLAN_IDS.map((id) => ({
    id,
    ...FALLBACK[id],
    price: products.find((p) => p.id === id)?.displayPrice ?? FALLBACK[id].price,
  }));
}

/**
 * Runs the store purchase sheet and resolves with what the API needs to verify it.
 * `finish` must be called after the server confirms, or the store will refund/replay it.
 */
export async function purchase(
  productId: PlanId,
): Promise<{ body: VerifyPurchase; finish: () => Promise<void> }> {
  if (usingTestStore) {
    return {
      body: { provider, productId, receipt: `test:${Crypto.randomUUID()}` },
      finish: async () => undefined,
    };
  }
  await connect();
  let offerToken: string | undefined;
  if (Platform.OS === 'android') {
    const [product] = ((await IAP.fetchProducts({ skus: [productId], type: 'subs' })) ??
      []) as Array<{
      subscriptionOffers?: Array<{ offerTokenAndroid?: string | null }>;
    }>;
    offerToken =
      product?.subscriptionOffers?.find((o) => o.offerTokenAndroid)?.offerTokenAndroid ?? undefined;
  }

  return new Promise((resolve, reject) => {
    const done = IAP.purchaseUpdatedListener((p) => {
      if (p.productId !== productId || !p.purchaseToken) return;
      cleanup();
      resolve({
        body: { provider, productId, receipt: p.purchaseToken },
        finish: async () => {
          await IAP.finishTransaction({ purchase: p, isConsumable: false });
        },
      });
    });
    const failed = IAP.purchaseErrorListener((e) => {
      cleanup();
      reject(
        IAP.isUserCancelledError(e)
          ? Object.assign(new Error('cancelled'), { cancelled: true })
          : e,
      );
    });
    const cleanup = () => {
      done.remove();
      failed.remove();
    };
    IAP.requestPurchase({
      type: 'subs',
      request: {
        apple: { sku: productId },
        google: {
          skus: [productId],
          ...(offerToken ? { subscriptionOffers: [{ sku: productId, offerToken }] } : {}),
        },
      },
    }).catch((e: unknown) => {
      cleanup();
      reject(e);
    });
  });
}

/** Returns receipts for purchases the store still knows about, for "Restore purchases". */
export async function restorable(): Promise<VerifyPurchase[]> {
  if (usingTestStore) return [];
  await connect();
  await IAP.restorePurchases();
  const purchases = (await IAP.getAvailablePurchases()) ?? [];
  return purchases
    .filter((p) => PLAN_IDS.includes(p.productId as PlanId) && p.purchaseToken)
    .map((p) => ({ provider, productId: p.productId as PlanId, receipt: p.purchaseToken! }));
}
