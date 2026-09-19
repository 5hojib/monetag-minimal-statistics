package com.monetag.publisher.widget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

import com.monetag.publisher.R;

import java.text.NumberFormat;
import java.util.Locale;

/**
 * Home-screen balance widget. Fully transparent, left-aligned today /
 * yesterday / total balance, with a refresh bolt on the right. Tapping it
 * re-fetches statistics from Monetag in the background (no app launch)
 * using the reader-only API key stored by the web app, then the values roll
 * up to the fresh numbers with an odometer-style count-up.
 */
public class BalanceWidgetProvider extends android.appwidget.AppWidgetProvider {

    public static final String ACTION_REFRESH = "com.monetag.publisher.widget.REFRESH";

    // Eased count-up "roll": frame count x frame ms (~0.7s total).
    private static final int ROLL_FRAMES = 14;
    private static final long ROLL_FRAME_MS = 50;

    public static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(
                new ComponentName(context, BalanceWidgetProvider.class));
        if (ids.length == 0) return;
        BalanceData data = BalanceStore.load(context);
        render(context, manager, ids, data.today, data.yesterday, data.balance);
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        BalanceData data = BalanceStore.load(context);
        render(context, appWidgetManager, appWidgetIds, data.today, data.yesterday, data.balance);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (ACTION_REFRESH.equals(intent.getAction())) {
            // Keep the broadcast alive while the network fetch runs.
            final PendingResult pending = goAsync();
            new Thread(() -> {
                try {
                    BalanceData fresh = WidgetFetch.fetch(context);
                    if (fresh != null) {
                        BalanceData prev = BalanceStore.load(context);
                        BalanceStore.saveCents(context, fresh.today, fresh.yesterday, fresh.balance);
                        animateCountUp(context, prev, fresh);
                    }
                } finally {
                    pending.finish();
                }
            }).start();
        }
    }

    /** Rolls today/yesterday/total from the previous values up to the new ones. */
    private static void animateCountUp(Context context, BalanceData from, BalanceData to) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(
                new ComponentName(context, BalanceWidgetProvider.class));
        if (ids.length == 0) return;

        new Thread(() -> {
            try {
                for (int f = 0; f <= ROLL_FRAMES; f++) {
                    double t = f / (double) ROLL_FRAMES;
                    double eased = 1 - Math.pow(1 - t, 3);
                    long today = from.today + Math.round((to.today - from.today) * eased);
                    long yesterday = from.yesterday + Math.round((to.yesterday - from.yesterday) * eased);
                    long balance = from.balance + Math.round((to.balance - from.balance) * eased);
                    render(context, manager, ids, today, yesterday, balance);
                    if (f < ROLL_FRAMES) Thread.sleep(ROLL_FRAME_MS);
                }
            } catch (InterruptedException ignored) {
            }
        }).start();
    }

    private static void render(Context context, AppWidgetManager manager, int[] ids,
                               long todayCents, long yesterdayCents, long balanceCents) {
        NumberFormat money = NumberFormat.getCurrencyInstance(Locale.US);

        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.balance_widget);
        views.setTextViewText(R.id.widget_today_value, money.format(todayCents / 100.0));
        views.setTextViewText(R.id.widget_yesterday_value, money.format(yesterdayCents / 100.0));
        views.setTextViewText(R.id.widget_balance_value, money.format(balanceCents / 100.0));

        Intent refresh = new Intent(context, BalanceWidgetProvider.class);
        refresh.setAction(ACTION_REFRESH);
        PendingIntent pending = PendingIntent.getBroadcast(
                context,
                0,
                refresh,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.widget_refresh, pending);

        for (int id : ids) {
            manager.updateAppWidget(id, views);
        }
    }
}