package com.monetag.publisher;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import com.monetag.publisher.widget.BalanceStore;
import com.monetag.publisher.widget.BalanceWidgetProvider;

/**
 * Bridge between the web app and the home-screen balance widget. The app
 * pushes today / yesterday / total balance on every refresh and the reader-only
 * API key + withdrawals once; the native side stores them and redraws the
 * widget, letting the button re-fetch from Monetag without opening the app.
 */
@CapacitorPlugin(name = "BalanceWidget")
public class BalanceWidgetPlugin extends Plugin {

    @PluginMethod
    public void update(PluginCall call) {
        double today = call.getDouble("today", 0.0);
        double yesterday = call.getDouble("yesterday", 0.0);
        double balance = call.getDouble("balance", 0.0);

        BalanceStore.save(getContext(), today, yesterday, balance);
        BalanceWidgetProvider.updateAll(getContext());
        call.resolve();
    }

    @PluginMethod
    public void configure(PluginCall call) {
        String apiKey = call.getString("apiKey", "");
        double withdrawals = call.getDouble("withdrawals", 0.0);

        BalanceStore.configure(getContext(), apiKey, withdrawals);
        call.resolve();
    }
}