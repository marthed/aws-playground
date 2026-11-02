import { loadFlags, variantOf } from './flags';
import { rum, track } from './tracking';

const FLAG = 'express_checkout';
const products = [
    { id: 'mug', name: 'Mug', price: 12 },
    { id: 'lamp', name: 'Desk lamp', price: 45 },
    { id: 'plant', name: 'Fake plant', price: 19 }
];

const view = document.querySelector<HTMLElement>('#view')!;
const debug = document.querySelector<HTMLElement>('#debug')!;
const cartLink = document.querySelector<HTMLElement>('#cart-link')!;
const cart: string[] = [];

const variant = variantOf(await loadFlags(), FLAG, rum.getUserId());
let exposed = false;
debug.textContent = `${FLAG}: ${variant} · session ${rum.getSessionId()}`;

const total = () => cart.reduce((sum, id) => sum + products.find((p) => p.id === id)!.price, 0);

function productList() {
    return products
        .map((p) => `<div class="product"><a href="#/product/${p.id}">${p.name}</a><span>${p.price} kr</span></div>`)
        .join('');
}

function productPage(id: string) {
    const product = products.find((p) => p.id === id);
    if (!product) return '<p>Not found</p>';
    track('shop.product_viewed', { productId: id, variant });
    return `<h1>${product.name}</h1><p>${product.price} kr</p><button data-add="${id}">Add to cart</button>`;
}

function cartPage() {
    if (cart.length === 0) return '<p>Your cart is empty.</p>';
    // Exposure is recorded here, where the variants first differ, so the experiment compares like with like
    if (!exposed) {
        exposed = true;
        track('shop.flag_exposure', { flag: FLAG, variant });
    }
    const express = variant === 'treatment' ? '<button class="express" data-buy="express">Express checkout</button>' : '';
    return `<h1>Cart</h1><p>${cart.length} items, ${total()} kr</p>${express} <button data-checkout>Checkout</button>`;
}

function checkoutPage() {
    track('shop.checkout_started', { variant, method: 'standard' });
    return `<h1>Checkout</h1><p>Total ${total()} kr</p><button data-buy="standard">Pay</button>`;
}

function render() {
    const route = location.hash.slice(1) || '/';
    rum.recordPageView(route.startsWith('/product/') ? '/product' : route);
    cartLink.textContent = `Cart (${cart.length})`;

    if (route.startsWith('/product/')) view.innerHTML = productPage(route.split('/')[2]);
    else if (route === '/cart') view.innerHTML = cartPage();
    else if (route === '/checkout') view.innerHTML = checkoutPage();
    else if (route === '/thanks') view.innerHTML = '<h1>Thanks!</h1>';
    else view.innerHTML = productList();
}

view.addEventListener('click', (event) => {
    const { add, buy, checkout } = (event.target as HTMLElement).dataset;
    if (add) {
        cart.push(add);
        track('shop.add_to_cart', { productId: add, variant });
        location.hash = '/cart';
    } else if (checkout !== undefined) {
        location.hash = '/checkout';
    } else if (buy) {
        if (buy === 'express') track('shop.checkout_started', { variant, method: 'express' });
        track('shop.purchase_completed', { variant, method: buy, value: total() });
        cart.length = 0;
        location.hash = '/thanks';
    }
});

window.addEventListener('hashchange', render);
render();
