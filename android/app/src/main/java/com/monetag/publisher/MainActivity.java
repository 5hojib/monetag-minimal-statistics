package com.monetag.publisher;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BalanceWidgetPlugin.class);
        super.onCreate(savedInstanceState);
    }
}