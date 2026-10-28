package kr.co.umap.tracker;

import android.content.Context;
import android.content.pm.PackageManager;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.DashPathEffect;
import android.graphics.Outline;
import android.graphics.Paint;
import android.graphics.PixelFormat;
import android.graphics.RectF;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.view.ViewOutlineProvider;
import android.view.WindowManager;
import android.view.animation.LinearInterpolator;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.animation.ValueAnimator;
import androidx.core.content.ContextCompat;

/**
 * Floating hint drawn over the system location screen.
 * It never changes the permission itself. It hides when 항상 허용 is on,
 * when the caller removes it, or when overlay permission is gone.
 */
public final class AlwaysAllowOverlay {
    static final String BANNER = "Umap 항상 허용으로 설정";
    static final String PRECISE = "정확한 위치 사용도 켜기";

    private static final Handler MAIN = new Handler(Looper.getMainLooper());
    private static final int BLUE = Color.parseColor("#0084FF");

    private static View root;
    private static RipplePin ripple;
    private static WindowManager windowManager;
    private static boolean showing;
    private static boolean shownOnce;
    private static Runnable watch;

    private AlwaysAllowOverlay() {}

    public static boolean canDraw(Context context) {
        return Settings.canDrawOverlays(context);
    }

    public static boolean show(Context context) {
        if (showing) return true;
        Context app = context.getApplicationContext();
        if (!canDraw(app) || hasBackground(app)) return false;
        WindowManager manager = (WindowManager) app.getSystemService(Context.WINDOW_SERVICE);
        if (manager == null) return false;
        try {
            View view = build(app);
            manager.addView(view, layoutParams());
            root = view;
            windowManager = manager;
            showing = true;
            shownOnce = true;
            if (ripple != null) ripple.start();
            startWatch(app);
            return true;
        } catch (RuntimeException error) {
            showing = false;
            root = null;
            ripple = null;
            windowManager = null;
            return false;
        }
    }

    public static void hide() {
        if (Looper.myLooper() == Looper.getMainLooper()) hideOnMain();
        else MAIN.post(AlwaysAllowOverlay::hideOnMain);
    }

    public static boolean consumeShown() {
        boolean value = shownOnce;
        shownOnce = false;
        return value;
    }

    private static void hideOnMain() {
        if (watch != null) {
            MAIN.removeCallbacks(watch);
            watch = null;
        }
        if (ripple != null) {
            ripple.stop();
            ripple = null;
        }
        if (root != null && windowManager != null) {
            try {
                windowManager.removeView(root);
            } catch (RuntimeException ignored) {
                /* already detached */
            }
        }
        root = null;
        windowManager = null;
        showing = false;
    }

    private static void startWatch(Context app) {
        if (watch != null) MAIN.removeCallbacks(watch);
        watch = new Runnable() {
            @Override
            public void run() {
                if (!showing) return;
                if (!canDraw(app) || hasBackground(app)) {
                    hideOnMain();
                    return;
                }
                MAIN.postDelayed(this, 250);
            }
        };
        MAIN.postDelayed(watch, 250);
    }

    private static boolean hasBackground(Context context) {
        if (Build.VERSION.SDK_INT < 29) return hasForeground(context);
        return granted(context, android.Manifest.permission.ACCESS_BACKGROUND_LOCATION);
    }

    private static boolean hasForeground(Context context) {
        return granted(context, android.Manifest.permission.ACCESS_FINE_LOCATION)
            || granted(context, android.Manifest.permission.ACCESS_COARSE_LOCATION);
    }

    private static boolean granted(Context context, String permission) {
        return ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED;
    }

    @SuppressWarnings("deprecation")
    private static WindowManager.LayoutParams layoutParams() {
        int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            : WindowManager.LayoutParams.TYPE_PHONE;
        int flags = WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
            | WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
            | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
            | WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED;
        WindowManager.LayoutParams params = new WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.MATCH_PARENT,
            type,
            flags,
            PixelFormat.TRANSLUCENT
        );
        params.gravity = Gravity.TOP | Gravity.START;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            params.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }
        return params;
    }

    private static View build(Context context) {
        int status = statusBarHeight(context);
        FrameLayout host = new FrameLayout(context);
        host.setClickable(false);

        DashedPill pill = new DashedPill(context);
        pill.setOrientation(LinearLayout.HORIZONTAL);
        pill.setGravity(Gravity.CENTER_VERTICAL);
        int padH = dp(context, 14);
        int padV = dp(context, 10);
        pill.setPadding(padH, padV, padH, padV);
        GradientDrawable background = new GradientDrawable();
        background.setColor(Color.WHITE);
        background.setCornerRadius(dp(context, 28));
        pill.setBackground(background);
        pill.setElevation(dp(context, 6));

        ImageView icon = new ImageView(context);
        icon.setImageDrawable(appIcon(context));
        icon.setScaleType(ImageView.ScaleType.CENTER_CROP);
        int iconSize = dp(context, 28);
        LinearLayout.LayoutParams iconParams = new LinearLayout.LayoutParams(iconSize, iconSize);
        iconParams.setMarginEnd(dp(context, 8));
        icon.setLayoutParams(iconParams);
        icon.setClipToOutline(true);
        icon.setOutlineProvider(new ViewOutlineProvider() {
            @Override
            public void getOutline(View view, Outline outline) {
                outline.setOval(0, 0, view.getWidth(), view.getHeight());
            }
        });
        pill.addView(icon);

        LinearLayout copy = new LinearLayout(context);
        copy.setOrientation(LinearLayout.VERTICAL);
        TextView title = new TextView(context);
        title.setText(BANNER);
        title.setTextColor(Color.parseColor("#1e293b"));
        title.setTextSize(14);
        title.setTypeface(title.getTypeface(), android.graphics.Typeface.BOLD);
        copy.addView(title);
        TextView hint = new TextView(context);
        hint.setText(PRECISE);
        hint.setTextColor(Color.parseColor("#64748b"));
        hint.setTextSize(12);
        copy.addView(hint);
        pill.addView(copy);

        FrameLayout.LayoutParams pillParams = new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.WRAP_CONTENT,
            FrameLayout.LayoutParams.WRAP_CONTENT,
            Gravity.TOP | Gravity.CENTER_HORIZONTAL
        );
        pillParams.topMargin = status + dp(context, 12);
        pillParams.leftMargin = dp(context, 16);
        pillParams.rightMargin = dp(context, 72);
        host.addView(pill, pillParams);

        int pinHost = dp(context, 96);
        FrameLayout pinWrap = new FrameLayout(context);
        RipplePin rings = new RipplePin(context);
        ripple = rings;
        pinWrap.addView(rings, new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        ));
        ImageView pin = new ImageView(context);
        GradientDrawable circle = new GradientDrawable();
        circle.setShape(GradientDrawable.OVAL);
        circle.setColor(BLUE);
        pin.setBackground(circle);
        pin.setImageResource(R.drawable.ic_overlay_pin);
        pin.setScaleType(ImageView.ScaleType.CENTER_INSIDE);
        int pinSize = dp(context, 52);
        int pinPad = dp(context, 12);
        pin.setPadding(pinPad, pinPad, pinPad, pinPad);
        pin.setElevation(dp(context, 8));
        FrameLayout.LayoutParams pinParams = new FrameLayout.LayoutParams(pinSize, pinSize, Gravity.CENTER);
        pinWrap.addView(pin, pinParams);
        FrameLayout.LayoutParams wrapParams = new FrameLayout.LayoutParams(pinHost, pinHost, Gravity.TOP | Gravity.END);
        wrapParams.topMargin = status + dp(context, 4);
        wrapParams.rightMargin = dp(context, 4);
        host.addView(pinWrap, wrapParams);
        return host;
    }

    private static Drawable appIcon(Context context) {
        try {
            return context.getPackageManager().getApplicationIcon(context.getPackageName());
        } catch (PackageManager.NameNotFoundException error) {
            return ContextCompat.getDrawable(context, R.mipmap.ic_launcher);
        }
    }

    private static int statusBarHeight(Context context) {
        int id = context.getResources().getIdentifier("status_bar_height", "dimen", "android");
        if (id <= 0) return dp(context, 24);
        return context.getResources().getDimensionPixelSize(id);
    }

    private static int dp(Context context, float value) {
        return Math.round(value * context.getResources().getDisplayMetrics().density);
    }

    /** Dashed stroke without GradientDrawable.setStroke(dash), which is API 29. */
    private static final class DashedPill extends LinearLayout {
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final RectF rect = new RectF();

        DashedPill(Context context) {
            super(context);
            setWillNotDraw(false);
            paint.setStyle(Paint.Style.STROKE);
            paint.setColor(BLUE);
            float width = dp(context, 1.5f);
            paint.setStrokeWidth(width);
            paint.setPathEffect(new DashPathEffect(new float[] { dp(context, 5), dp(context, 3) }, 0));
        }

        @Override
        protected void dispatchDraw(Canvas canvas) {
            super.dispatchDraw(canvas);
            float inset = paint.getStrokeWidth();
            rect.set(inset, inset, getWidth() - inset, getHeight() - inset);
            float radius = rect.height() / 2f;
            canvas.drawRoundRect(rect, radius, radius, paint);
        }
    }

    private static final class RipplePin extends View {
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final ValueAnimator animator;
        private float fraction;

        RipplePin(Context context) {
            super(context);
            paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeWidth(dp(context, 2));
            paint.setColor(BLUE);
            animator = ValueAnimator.ofFloat(0f, 1f);
            animator.setDuration(1400);
            animator.setRepeatCount(ValueAnimator.INFINITE);
            animator.setInterpolator(new LinearInterpolator());
            animator.addUpdateListener(animation -> {
                fraction = (float) animation.getAnimatedValue();
                invalidate();
            });
        }

        void start() {
            if (!animator.isStarted()) animator.start();
        }

        void stop() {
            animator.cancel();
        }

        @Override
        protected void onDraw(Canvas canvas) {
            float cx = getWidth() / 2f;
            float cy = getHeight() / 2f;
            float max = Math.min(cx, cy);
            if (max <= 0f) return;
            for (int i = 0; i < 2; i += 1) {
                float shift = (fraction + i * 0.5f) % 1f;
                paint.setAlpha((int) ((1f - shift) * 170));
                canvas.drawCircle(cx, cy, max * (0.42f + 0.58f * shift), paint);
            }
        }
    }
}
