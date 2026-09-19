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
 * Home-screen balance widget. Transparent, left-aligned today / yesterday /
 * total balance with a refresh bolt on the right. Tapping it re-fetches
 * statistics from Monetag in the background (no app launch) using the
 * reader-only API key stored by the web app, then the values roll up with an
 * odometer animation: each value is a ViewFlipper carrying roll frames, and
 * flipping between them plays the XML slide animations. It stays animated
 * even when the fetched figures are unchanged (the roll always starts below).
 */
public class BalanceWidgetProvider extends android.appwidget.AppWidgetProvider {

    public static final String ACTION_REFRESH = "com.monetag.publisher.widget.REFRESH";

    // Roll frames per value (ViewFlipper children) and the pause per hop.
    private static final int ROLL_STEPS = 5;
    private static final long ROLL_HOP_MS = 160;

    private static final int[] TODAY_VALUE_IDS = {
            R.id.widget_today_value_0,
            R.id.widget_today_value_1,
            R.id.widget_today_value_2,
            R.id.widget_today_value_3,
            R.id.widget_today_value_4,
    };
    private static final int[] YESTERDAY_VALUE_IDS = {
            R.id.widget_yesterday_value_0,
            R.id.widget_yesterday_value_1,
            R.id.widget_yesterday_value_2,
            R.id.widget_yesterday_value_3,
            R.id.widget_yesterday_value_4,
    };
    private static final int[] BALANCE_VALUE_IDS = {
            R.id.widget_balance_value_0,
            R.id.widget_balance_value_1,
            R.id.widget_balance_value_2,
            R.id.widget_balance_value_3,
            R.id.widget_balance_value_4,
    };

    public static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(
                new ComponentName(context, BalanceWidgetProvider.class));
        if (ids.length == 0) return;
        BalanceData data = BalanceStore.load(context);
        render(context, manager, ids, data.today, data.yesterday, data.balance, ROLL_STEPS - 1);
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        BalanceData data = BalanceStore.load(context);
        render(context, appWidgetManager, appWidgetIds,
                data.today, data.yesterday, data.balance, ROLL_STEPS - 1);
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
                        BalanceStore.saveCents(context, fresh.today, fresh.yesterday, fresh.balance);
                        animateRoll(context, fresh.today, fresh.yesterday, fresh.balance);
                    }
                } finally {
                    pending.finish();
                }
            }).start();
        }
    }

    /**
     * Plays the odometer roll to the given values. Frames always start below
     * the target (never equal to it), so the roll is clearly visible on every
     * tap even when the numbers did not actually change.
     */
    private static void animateRoll(Context context, long today, long yesterday, long balance) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(
                new ComponentName(context, BalanceWidgetProvider.class));
        if (ids.length == 0) return;

        long[] todayFrames = rollFrames(today);
        long[] yesterdayFrames = rollFrames(yesterday);
        long[] balanceFrames = rollFrames(balance);

        new Thread(() -> {
            try {
                for (int step = 0; step < ROLL_STEPS; step++) {
                    render(context, manager, ids,
                            todayFrames[step], yesterdayFrames[step], balanceFrames[step], step);
                    if (step < ROLL_STEPS - 1) Thread.sleep(ROLL_HOP_MS);
                }
            } catch (InterruptedException ignored) {
            }
        }).start();
    }

    /** Eased frames from a 50% base up to the target value. */
    private static long[] rollFrames(long target) {
        long base = Math.max(0, Math.round(target * 0.5));
        long[] frames = new long[ROLL_STEPS];
        for (int i = 0; i < ROLL_STEPS; i++) {
            double t = i / (double) (ROLL_STEPS - 1);
            double eased = 1 - Math.pow(1 - t, 3);
            frames[i] = base + Math.round((target - base) * eased);
        }
        return frames;
    }

    private static void render(Context context, AppWidgetManager manager, int[] ids,
                               long todayCents, long yesterdayCents, long balanceCents, int step) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.balance_widget);

        setValueChildren(views, TODAY_VALUE_IDS, R.id.roll_today, todayCents, step);
        setValueChildren(views, YESTERDAY_VALUE_IDS, R.id.roll_yesterday, yesterdayCents, step);
        setValueChildren(views, BALANCE_VALUE_IDS, R.id.roll_balance, balanceCents, step);

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

    private static void setValueChildren(RemoteViews views, int[] childIds, int flipperId,
                                         long cents, int step) {
        NumberFormat money = NumberFormat.getCurrencyInstance(Locale.US);
        for (int childId : childIds) {
            views.setTextViewText(childId, money.format(cents / 100.0));
        }
        views.setDisplayedChild(flipperId, step);
    }
}