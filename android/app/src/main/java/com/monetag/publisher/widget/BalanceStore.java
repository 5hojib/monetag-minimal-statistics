package com.monetag.publisher.widget;

import android.content.Context;
import android.content.SharedPreferences;

/**
 * Persists the latest balances (in cents) so the widget can render without
 * running the WebView. Written by BalanceWidgetPlugin whenever the web app
 * recomputes today / yesterday / total balance.
 */
public final class BalanceStore {

    private static final String NAME = "balance_widget_v1";
    private static final String KEY_TODAY = "today_cents";
    private static final String KEY_YESTERDAY = "yesterday_cents";
    private static final String KEY_BALANCE = "balance_cents";

    private BalanceStore() {
    }

    public static void save(Context context, double today, double yesterday, double balance) {
        context.getSharedPreferences(NAME, Context.MODE_PRIVATE)
                .edit()
                .putLong(KEY_TODAY, Math.round(today * 100))
                .putLong(KEY_YESTERDAY, Math.round(yesterday * 100))
                .putLong(KEY_BALANCE, Math.round(balance * 100))
                .apply();
    }

    public static BalanceData load(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(NAME, Context.MODE_PRIVATE);
        return new BalanceData(
                prefs.getLong(KEY_TODAY, 0),
                prefs.getLong(KEY_YESTERDAY, 0),
                prefs.getLong(KEY_BALANCE, 0));
    }

    public static boolean hasData(Context context) {
        return context.getSharedPreferences(NAME, Context.MODE_PRIVATE)
                .contains(KEY_BALANCE);
    }
}