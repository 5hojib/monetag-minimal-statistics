package com.monetag.publisher.widget;

import android.content.Context;
import android.content.SharedPreferences;

/**
 * Persists the data the home-screen balance widget needs so it can render —
 * and independently refresh — without running the WebView. The web app pushes
 * balances on every change and the reader-only API key + withdrawals once,
 * so the refresh button can re-fetch from Monetag in the background.
 */
public final class BalanceStore {

    private static final String NAME = "balance_widget_v1";
    private static final String KEY_TODAY = "today_cents";
    private static final String KEY_YESTERDAY = "yesterday_cents";
    private static final String KEY_BALANCE = "balance_cents";
    private static final String KEY_API_KEY = "api_key";
    private static final String KEY_WITHDRAWALS = "withdrawals_cents";

    private BalanceStore() {
    }

    /** Stores the reader-only API key + withdrawals in dollars. */
    public static void configure(Context context, String apiKey, double withdrawalsDollars) {
        context.getSharedPreferences(NAME, Context.MODE_PRIVATE)
                .edit()
                .putString(KEY_API_KEY, apiKey == null ? "" : apiKey.trim())
                .putLong(KEY_WITHDRAWALS, Math.round(withdrawalsDollars * 100))
                .apply();
    }

    public static String getApiKey(Context context) {
        return context.getSharedPreferences(NAME, Context.MODE_PRIVATE)
                .getString(KEY_API_KEY, "");
    }

    public static double getWithdrawals(Context context) {
        return context.getSharedPreferences(NAME, Context.MODE_PRIVATE)
                .getLong(KEY_WITHDRAWALS, 0) / 100.0;
    }

    public static void save(Context context, double today, double yesterday, double balance) {
        saveCents(context,
                Math.round(today * 100),
                Math.round(yesterday * 100),
                Math.round(balance * 100));
    }

    public static void saveCents(Context context, long todayCents, long yesterdayCents, long balanceCents) {
        context.getSharedPreferences(NAME, Context.MODE_PRIVATE)
                .edit()
                .putLong(KEY_TODAY, todayCents)
                .putLong(KEY_YESTERDAY, yesterdayCents)
                .putLong(KEY_BALANCE, balanceCents)
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