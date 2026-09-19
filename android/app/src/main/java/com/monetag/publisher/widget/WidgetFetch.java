package com.monetag.publisher.widget;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.Reader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;

/**
 * Background refresh for the widget: re-fetches statistics directly from
 * Monetag (read-only, using the stored API key) and recomputes today,
 * yesterday and total balance = lifetime earnings - withdrawals.
 *
 * Mirror of the web app's api/client.ts request shape so figures match.
 */
public final class WidgetFetch {

    private static final String STATISTICS_URL = "https://api.monetag.com/v5/pub/statistics";
    private static final int PAGE_SIZE = 500;
    private static final int MAX_PAGES = 6;
    private static final String EPOCH = "2000-01-01";

    private WidgetFetch() {
    }

    /** Returns a fresh BalanceData (in cents), or null when nothing can be fetched. */
    public static BalanceData fetch(Context context) {
        String apiKey = BalanceStore.getApiKey(context);
        if (apiKey.isEmpty()) return null;

        double withdrawals = BalanceStore.getWithdrawals(context);
        String today = iso(new Date());
        String yesterday = iso(addDays(new Date(), -1));

        double todayMoney = 0;
        double yesterdayMoney = 0;
        double lifetime = 0;

        for (int page = 1; page <= MAX_PAGES; page++) {
            JSONArray rows = post(apiKey, EPOCH, today, page);
            if (rows == null) return null;
            for (int i = 0; i < rows.length(); i++) {
                JSONObject row = rows.optJSONObject(i);
                if (row == null) continue;
                double money = row.optDouble("money", 0.0);
                lifetime += money;
                String date = row.optString("date_time", "");
                if (date.equals(today)) {
                    todayMoney = money;
                } else if (date.equals(yesterday)) {
                    yesterdayMoney = money;
                }
            }
            if (rows.length() < PAGE_SIZE) break;
        }

        return new BalanceData(
                Math.round(todayMoney * 100),
                Math.round(yesterdayMoney * 100),
                Math.round((lifetime - withdrawals) * 100));
    }

    private static JSONArray post(String apiKey, String from, String to, int page) {
        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) new URL(STATISTICS_URL).openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(15000);
            conn.setDoOutput(true);
            conn.setRequestProperty("Authorization", "Bearer " + apiKey);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Accept", "application/json");

            JSONObject body = new JSONObject();
            body.put("page", page);
            body.put("page_size", PAGE_SIZE);
            body.put("date_from", from);
            body.put("date_to", to);
            body.put("group_by", new JSONArray().put("date_time"));

            try (OutputStream os = conn.getOutputStream()) {
                os.write(body.toString().getBytes(StandardCharsets.UTF_8));
            }

            int code = conn.getResponseCode();
            if (code < 200 || code >= 300) return null;

            try (InputStream is = conn.getInputStream()) {
                JSONObject json = new JSONObject(readAll(is));
                return json.optJSONArray("result");
            }
        } catch (Exception e) {
            return null;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private static String readAll(InputStream is) throws IOException {
        StringBuilder sb = new StringBuilder();
        try (Reader reader = new InputStreamReader(is, StandardCharsets.UTF_8)) {
            char[] buf = new char[4096];
            int n;
            while ((n = reader.read(buf)) > 0) sb.append(buf, 0, n);
        }
        return sb.toString();
    }

    private static String iso(Date date) {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(date);
    }

    private static Date addDays(Date date, int days) {
        Calendar cal = Calendar.getInstance();
        cal.setTime(date);
        cal.add(Calendar.DAY_OF_YEAR, days);
        return cal.getTime();
    }
}