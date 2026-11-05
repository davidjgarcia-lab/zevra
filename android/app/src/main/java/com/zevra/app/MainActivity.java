package com.zevra.app;

import android.app.Activity;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    // Android 14+: aviso cuando alguien intenta hacer una captura (la imagen sale en negro igualmente)
    private Object screenCaptureCallback;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Bloquea capturas y grabaciones de pantalla en toda la app (salen en negro)
        // y oculta el contenido en la vista de apps recientes.
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
    }

    @Override
    public void onStart() {
        super.onStart();
        if (Build.VERSION.SDK_INT >= 34) {
            Activity.ScreenCaptureCallback cb = () -> runOnUiThread(() -> {
                if (getBridge() != null && getBridge().getWebView() != null) {
                    getBridge().getWebView().evaluateJavascript("window.dispatchEvent(new Event('zevra-screenshot'))", null);
                }
            });
            screenCaptureCallback = cb;
            registerScreenCaptureCallback(getMainExecutor(), cb);
        }
    }

    @Override
    public void onStop() {
        if (Build.VERSION.SDK_INT >= 34 && screenCaptureCallback != null) {
            unregisterScreenCaptureCallback((Activity.ScreenCaptureCallback) screenCaptureCallback);
            screenCaptureCallback = null;
        }
        super.onStop();
    }
}
