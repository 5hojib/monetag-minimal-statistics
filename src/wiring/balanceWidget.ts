import { registerPlugin } from '@capacitor/core';

export interface BalanceWidgetUpdate {
  today: number;
  yesterday: number;
  balance: number;
}

interface BalanceWidgetPlugin {
  update(options: BalanceWidgetUpdate): Promise<void>;
}

const BalanceWidget = registerPlugin<BalanceWidgetPlugin>('BalanceWidget');

// Pushes the latest balances to the native home-screen widget. No-op on web.
export async function syncBalanceWidget(data: BalanceWidgetUpdate): Promise<void> {
  try {
    await BalanceWidget.update(data);
  } catch {
    // Native widget bridge unavailable (web/dev preview) — nothing to update.
  }
}