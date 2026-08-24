package com.rivenmark.game;

import android.annotation.SuppressLint;
import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.appcompat.app.AppCompatActivity;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

/**
 * The game is one self-contained HTML file. This is the whole app: a WebView
 * drawn edge to edge with the system bars hidden, loading that file out of
 * assets. No network, no permissions, nothing else.
 */
public class MainActivity extends AppCompatActivity {

    private WebView web;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // The page is authored with viewport-fit=cover and reads
        // env(safe-area-inset-*) to keep the HUD clear of a notch. Those
        // resolve to zero unless the app actually draws behind the system
        // bars, so this call is what makes the game's own safe-area handling
        // mean anything.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);          // best-delve record is localStorage
        s.setAllowFileAccess(false);           // assets load without it
        s.setAllowContentAccess(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setTextZoom(100);                    // system font scale must not resize the UI
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);

        web.setBackgroundColor(Color.parseColor("#0b0908"));
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setLongClickable(false);
        web.setHapticFeedbackEnabled(false);
        // A long press otherwise raises text selection mid-fight.
        web.setOnLongClickListener(v -> true);

        // Nothing should ever navigate away; there is nowhere to go.
        web.setWebViewClient(new WebViewClient());

        // Debug build only: lets chrome://inspect attach to the running game.
        WebView.setWebContentsDebuggingEnabled(true);

        web.loadUrl("file:///android_asset/index.html");
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    private void hideSystemBars() {
        WindowInsetsControllerCompat c =
                WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        c.hide(androidx.core.view.WindowInsetsCompat.Type.systemBars());
        c.setSystemBarsBehavior(
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    }

    @Override
    protected void onPause() {
        super.onPause();
        web.onPause();
        // Losing focus mid-delve should pause the game, not leave the Vanguard
        // standing in a crowd.
        web.evaluateJavascript(
                "try{ if(typeof pauseRun==='function') pauseRun(); }catch(e){}", null);
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    @Override
    public void onBackPressed() {
        // Back pauses a run in progress rather than closing the app out from
        // under it -- but it must still be able to leave, or the only way out
        // of the app is the home button.
        web.evaluateJavascript(
                "(function(){ try{ if(typeof state!=='undefined' && state==='play'" +
                " && typeof pauseRun==='function'){ pauseRun(); return 'paused'; } }" +
                "catch(e){} return 'exit'; })()",
                value -> {
                    if (value == null || value.contains("exit")) super.onBackPressed();
                });
    }
}
