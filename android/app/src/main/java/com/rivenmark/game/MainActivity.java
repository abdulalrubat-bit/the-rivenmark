package com.rivenmark.game;

import android.annotation.SuppressLint;
import android.content.pm.ApplicationInfo;
import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;

/**
 * The whole app: a WebView drawn edge to edge with the system bars hidden,
 * running the game out of assets. No network, no permissions, nothing else.
 *
 * The page is SERVED, not opened. It used to be loaded straight off
 * file:///android_asset/index.html, which worked while the game was one
 * self-contained HTML file with everything inlined. The Phaser build is not:
 * it fetches atlas.json and manifest.json, and XHR from a file:// origin is
 * refused by every current WebView -- setAllowFileAccessFromFileURLs was the
 * old way round that and is ignored on modern ones. WebViewAssetLoader serves
 * the same assets over a real https origin instead, which fixes the fetches
 * and gives three things for free: a secure context (so the clipboard works
 * for the diagnostics dump), a stable origin for localStorage, and no file://
 * access to grant at all.
 */
public class MainActivity extends AppCompatActivity {

    /** Any host works; this is the one androidx documents and reserves. */
    private static final String ORIGIN = "https://appassets.androidplatform.net";

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
        s.setDomStorageEnabled(true);          // the stash is localStorage
        s.setAllowFileAccess(false);           // nothing is loaded off file:// now
        s.setAllowContentAccess(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setTextZoom(100);                    // system font scale must not resize the UI
        // The atlas is 1.6MB and never changes between launches. Caching it is
        // the difference between a game and a web page, and the asset loader
        // is serving from local storage anyway.
        s.setCacheMode(WebSettings.LOAD_DEFAULT);

        web.setBackgroundColor(Color.parseColor("#0b0908"));
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setLongClickable(false);
        web.setHapticFeedbackEnabled(false);
        // A long press otherwise raises text selection mid-fight.
        web.setOnLongClickListener(v -> true);

        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .setDomain("appassets.androidplatform.net")
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        web.setWebViewClient(new WebViewClientCompat() {
            @Override
            public WebResourceResponse shouldInterceptRequest(
                    @NonNull WebView view, @NonNull WebResourceRequest request) {
                return loader.shouldInterceptRequest(request.getUrl());
            }
            // Nothing should ever navigate away; there is nowhere to go.
            @Override
            public boolean shouldOverrideUrlLoading(
                    @NonNull WebView view, @NonNull WebResourceRequest request) {
                return true;
            }
        });

        // Debug build only: lets chrome://inspect attach to the running game.
        // The comment always said so and the call never checked -- so a
        // release build shipped a WebView any USB-connected computer could
        // open, read and drive. FLAG_DEBUGGABLE is set by the debug build type
        // and never by release, so this is the build deciding, not a constant
        // someone has to remember to flip.
        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            WebView.setWebContentsDebuggingEnabled(true);
        }

        web.loadUrl(ORIGIN + "/assets/index.html");
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
        // standing in a crowd. pauseRun is the core's, so it is there in both
        // builds.
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
        // Back steps out of whatever is on top, the way it does everywhere
        // else on Android: the bag closes, a delve in progress is held, and
        // the held card lets it go again. Only from the gate-house does it
        // leave the app -- it must still be able to, or the only way out is
        // the home button. It used to know only about a delve in progress, so
        // Back with the bag open closed the whole app.
        web.evaluateJavascript(
                "(function(){ try{ if(typeof state==='undefined') return 'exit';" +
                " if(state==='gear'){ closeGear(); return 'closed'; }" +
                " if(state==='play'){ pauseRun(); return 'paused'; }" +
                " if(state==='pause'){ resumeRun(); return 'resumed'; } }" +
                "catch(e){} return 'exit'; })()",
                value -> {
                    if (value == null || value.contains("exit")) super.onBackPressed();
                });
    }
}
