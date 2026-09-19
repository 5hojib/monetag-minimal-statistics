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
 * reader-only API key stored by the web app, then the total balance rolls up
 * like a mechanical odometer: the total is rendered as a row of 11 digit
 * wheels (one {@code ViewFlipper} per column), and each frame hops the
 * displayed slot up to the next digit, so columns notch one-by-one from the
 * right while the today / yesterday figures settle instantly. Frames always
 * start below the target, so every refresh rolls even when the figures did
 * not actually change.
 */
public class BalanceWidgetProvider extends android.appwidget.AppWidgetProvider {

    public static final String ACTION_REFRESH = "com.monetag.publisher.widget.REFRESH";

    // Roll frames for the odometer and the pause per hop.
    private static final int ROLL_FRAMES = 12;
    private static final long ROLL_FRAME_MS = 70;

    // Digit-wheel alphabet (must match the children of each total_wheel)
    // and the number of right-aligned columns in the widget.
    private static final String WHEEL_CHARS = "0123456789$,-. ";
    private static final int TOTAL_COLS = 11;

    private static final int[] TOTAL_WHEEL_IDS = {
            R.id.total_wheel_0,
            R.id.total_wheel_1,
            R.id.total_wheel_2,
            R.id.total_wheel_3,
            R.id.total_wheel_4,
            R.id.total_wheel_5,
            R.id.total_wheel_6,
            R.id.total_wheel_7,
            R.id.total_wheel_8,
            R.id.total_wheel_9,
            R.id.total_wheel_10,
    };

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
        render(context, appWidgetManager, appWidgetIds,
                data.today, data.yesterday, data.balance);
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

        String todayText = moneyText(today);
        String yesterdayText = moneyText(yesterday);
        long[] frames = rollFrames(balance);

        new Thread(() -> {
            try {
                for (int step = 0; step < ROLL_FRAMES; step++) {
                    render(context, manager, ids,
                            todayText, yesterdayText, frames[step]);
                    if (step < ROLL_FRAMES - 1) Thread.sleep(ROLL_FRAME_MS);
                }
            } catch (InterruptedException ignored) {
            }
        }).start();
    }

    /** Eased frames from a 50% base up to the target value. */
    private static long[] rollFrames(long target) {
        long base = Math.max(0, Math.round(target * 0.5));
        long[] frames = new long[ROLL_FRAMES];
        for (int i = 0; i < ROLL_FRAMES; i++) {
            double t = i / (double) (ROLL_FRAMES - 1);
            double eased = 1 - Math.pow(1 - t, 3);
            frames[i] = base + Math.round((target - base) * eased);
        }
        return frames;
    }

    private static void render(Context context, AppWidgetManager manager, int[] ids,
                               String todayText, String yesterdayText, long balanceCents) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.balance_widget);

        views.setTextViewText(R.id.widget_today_value, todayText);
        views.setTextViewText(R.id.widget_yesterday_value, yesterdayText);
        setBalanceWheels(views, balanceCents);

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

    /** Maps the formatted balance, right-aligned, onto the 11 digit wheels. */
    private static void setBalanceWheels(RemoteViews views, long balanceCents) {
        String s = moneyText(balanceCents);
        int start = Math.max(0, s.length() - TOTAL_COLS);
        for (int c = 0; c < TOTAL_COLS; c++) {
            char ch = start + c < s.length() ? s.charAt(start + c) : ' ';
            int index = WHEEL_CHARS.indexOf(ch);
            if (index < 0) index = WHEEL_CHARS.indexOf(' ');
            views.setDisplayedChild(TOTAL_WHEEL_IDS[c], index);
        }
    }

    private static String moneyText(long cents) {
        NumberFormat money = NumberFormat.getCurrencyInstance(Locale.US);
        return money.format(cents / 100.0);
    }
}