import { AwsRum } from 'aws-rum-web';

const { VITE_AWS_REGION, VITE_RUM_APP_MONITOR_ID, VITE_RUM_IDENTITY_POOL_ID, VITE_RUM_ENDPOINT } = import.meta.env;

// A set endpoint means the local mock, which takes unsigned requests
const target = VITE_RUM_ENDPOINT
    ? { endpoint: VITE_RUM_ENDPOINT, signing: false }
    : { identityPoolId: VITE_RUM_IDENTITY_POOL_ID };

export const rum = new AwsRum(VITE_RUM_APP_MONITOR_ID, '0.1.0', VITE_AWS_REGION, {
    ...target,
    allowCookies: true,
    sessionSampleRate: 1,
    telemetries: ['errors', 'performance', 'http'],
    disableAutoPageView: true
});

export type ShopEvent =
    | 'shop.product_viewed'
    | 'shop.add_to_cart'
    | 'shop.flag_exposure'
    | 'shop.checkout_started'
    | 'shop.purchase_completed';

export function track(event: ShopEvent, data: Record<string, string | number> = {}) {
    rum.recordEvent(event, data);
}
