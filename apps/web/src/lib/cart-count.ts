'use client';

import type { CartView } from '@hedax/contracts';
import { useSyncExternalStore } from 'react';
import { api } from './api/client';
import { cartUnitCount } from './cart-units';

/**
 * The cart total shared by every header. It lives outside React, so it survives the header being
 * remounted when a navigation crosses layouts; `count` stays null until the server has answered,
 * so a page that is still loading or a failed request never claims the cart is empty.
 */
export interface CartCountState { count: number | null; failed: boolean }

const LOADING: CartCountState = { count: null, failed: false };
const CHANNEL = 'hedax-cart';

let state = LOADING;
let ticket = 0;
let started = false;
let channel: BroadcastChannel | null = null;
const listeners = new Set<() => void>();

function publish(next: CartCountState) {
  state = next;
  listeners.forEach((listener) => listener());
}

async function refresh() {
  const mine = ++ticket;
  try {
    const cart = await api<CartView>('/cart');
    if (mine === ticket) publish({ count: cartUnitCount(cart.lines), failed: false });
  } catch {
    // The last known total stays on the icon; a failure says nothing about the cart.
    if (mine === ticket) publish({ count: state.count, failed: true });
  }
}

function start() {
  if (started) return;
  started = true;
  void refresh();
  // A page restored from the back/forward cache or a tab coming back into view, or a change in another tab, may be out of date.
  window.addEventListener('pageshow', (event) => { if (event.persisted) void refresh(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void refresh(); });
  if (typeof BroadcastChannel === 'function') {
    channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = () => { void refresh(); };
  }
}

/** Call after any change to the cart; pass the cart the change returned, and no extra request is made. */
export function cartChanged(cart?: Pick<CartView, 'lines'>) {
  if (cart) {
    ticket++;
    publish({ count: cartUnitCount(cart.lines), failed: false });
  } else {
    void refresh();
  }
  channel?.postMessage('changed');
}

export function useCartCount(): CartCountState {
  return useSyncExternalStore((listener) => {
    listeners.add(listener);
    start();
    return () => { listeners.delete(listener); };
  }, () => state, () => LOADING);
}
