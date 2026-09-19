package com.monetag.publisher.widget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.view.animation.AlphaAnimation;
import android.view.animation.Animation;
import android.view.animation.AnimationSet;
import android.view.animation.DecelerateInterpolator;
import android.view.animation.TranslateAnimation;
import android.widget.RemoteViews;

import com.monetag.publisher.R;

import java.text.NumberFormat;
import java.util.Locale;

/**
 * Home-screen balance widget. Fully transparent, left-aligned today /
 * yesterday / total balance, with a refresh button on the right. Tapping
 * refresh re-fetches statistics from Monetag in the background (no app
 * launch) using the reader-only API key stored by the web app.
 */
public class BalanceWidgetProvider extends android.appwidget.AppWidgetProvider {

    public static final String ACTION_REFRESH = "com.monetag.publisher.widget.REFRESH";

    public static void updateAll(Context context) {
        updateAll(context, false);
    }

    public static void updateAll(Context context, boolean animate) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(
                new ComponentName(context, BalanceWidgetProvider.class));
        update(context, manager, ids, animate);
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        update(context, appWidgetManager, appWidgetIds, false);
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
                        updateAll(context, true); // odometer roll on each value
                    }
                } finally {
                    pending.finish();
                }
            }).start();
        }
    }

    private static void update(Context context, AppWidgetManager manager, int[] ids, boolean animate) {
        if (ids.length == 0) return;

        BalanceData data = BalanceStore.load(context);
        NumberFormat money = NumberFormat.getCurrencyInstance(Locale.US);
        boolean hasData = BalanceStore.hasData(context);

        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.balance_widget);
        if (hasData) {
            views.setTextViewText(R.id.widget_today_value, money.format(data.today / 100.0));
            views.setTextViewText(R.id.widget_yesterday_value, money.format(data.yesterday / 100.0));
            views.setTextViewText(R.id.widget_balance_value, money.format(data.balance / 100.0));

            if (animate) {
                views.setViewAnimation(R.id.widget_today_value, rollAnimation());
                views.setViewAnimation(R.id.widget_yesterday_value, rollAnimation());
                views.setViewAnimation(R.id.widget_balance_value, rollAnimation());
            }
        }

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

    /** Odometer-style roll: values slide up and fade in on refresh. */
    private static Animation rollAnimation() {
        AnimationSet set = new AnimationSet(true);
        AlphaAnimation fade = new AlphaAnimation(0f, 1f);
        fade.setDuration(420);
        TranslateAnimation slide = new TranslateAnimation(
                Animation.RELATIVE_TO_SELF, 0f,
                Animation.RELATIVE_TO_SELF, 0f,
                Animation.RELATIVE_TO_SELF, 0.7f,
                Animation.RELATIVE_TO_SELF, 0f);
        slide.setDuration(420);
        slide.setInterpolator(new DecelerateInterpolator());
        set.addAnimation(fade);
        set.addAnimation(slide);
        set.setStartOffset(0);
        set.setFillAfter(false);
        return set;
    }
}