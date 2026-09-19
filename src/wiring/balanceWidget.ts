import { registerPlugin } from '@capacitor/core';

export interface BalanceWidgetUpdate {
  today: number;
  yesterday: number;
  balance: number;
}

export interface BalanceWidgetConfig {
  apiKey: string;
  withdrawals: number;
}

interface BalanceWidgetPlugin {
  update(options: BalanceWidgetUpdate): Promise<void>;
  configure(options: BalanceWidgetConfig): Promise<void>;
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

// Gives the native widget the reader-only API key + withdrawals so its
// refresh button can re-fetch from Monetag without opening the app.
export async function configureBalanceWidget(data: BalanceWidgetConfig): Promise<void> {
  try {
    await BalanceWidget.configure(data);
  } catch {
    // Native widget bridge unavailable (web/dev preview) — nothing to update.
  }
}