package com.monetag.publisher.widget;

/**
 * Snapshot of the balances shown on the home-screen widget.
 * Money is stored in integer cents so formatting is exact.
 */
public class BalanceData {
    public final long today;
    public final long yesterday;
    public final long balance;

    public BalanceData(long today, long yesterday, long balance) {
        this.today = today;
        this.yesterday = yesterday;
        this.balance = balance;
    }
}