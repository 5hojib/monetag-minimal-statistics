package com.monetag.publisher.widget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

import com.monetag.publisher.MainActivity;
import com.monetag.publisher.R;

import java.text.NumberFormat;
import java.util.Locale;

/**
 * Home-screen balance widget. Fully transparent, left-aligned today /
 * yesterday / total balance, with a refresh button on the right that opens
 * the app (which re-syncs and then refreshes this widget).
 */
public class BalanceWidgetProvider extends android.appwidget.AppWidgetProvider {

    public static final String ACTION_REFRESH = "com.monetag.publisher.widget.REFRESH";

    public static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(
                new ComponentName(context, BalanceWidgetProvider.class));
        update(context, manager, ids);
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        update(context, appWidgetManager, appWidgetIds);
    }

    private static void update(Context context, AppWidgetManager manager, int[] ids) {
        if (ids.length == 0) return;

        BalanceData data = BalanceStore.load(context);
        NumberFormat money = NumberFormat.getCurrencyInstance(Locale.US);
        boolean hasData = BalanceStore.hasData(context);

        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.balance_widget);
        if (hasData) {
            views.setTextViewText(R.id.widget_today_value, money.format(data.today / 100.0));
            views.setTextViewText(R.id.widget_yesterday_value, money.format(data.yesterday / 100.0));
            views.setTextViewText(R.id.widget_balance_value, money.format(data.balance / 100.0));
        }

        Intent open = new Intent(context, MainActivity.class);
        open.setAction(ACTION_REFRESH);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_ACTIVITY_CLEAR_TOP
                | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pending = PendingIntent.getActivity(
                context,
                0,
                open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.widget_refresh, pending);

        for (int id : ids) {
            manager.updateAppWidget(id, views);
        }
    }
}