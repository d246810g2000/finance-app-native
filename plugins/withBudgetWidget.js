const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const PACKAGE_NAME = 'com.anonymous.financeappnative';
const PACKAGE_PATH = 'com/anonymous/financeappnative';

const WIDGET_SMALL_LAYOUT_XML = `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical"
    android:gravity="center_vertical"
    android:background="@drawable/widget_bg"
    android:padding="12dp">

    <TextView
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:text="日常預算 / Daily Budget"
        android:textColor="#94A3B8"
        android:textSize="10sp"
        android:textStyle="bold"
        android:layout_marginBottom="4dp"/>

    <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:orientation="horizontal"
        android:gravity="center_vertical">

        <TextView
            android:id="@+id/tv_percent"
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:textColor="#FFFFFF"
            android:textSize="13sp"
            android:textStyle="bold" />

        <TextView
            android:id="@+id/tv_daily"
            android:layout_width="0dp"
            android:layout_height="wrap_content"
            android:layout_weight="1"
            android:gravity="center_horizontal"
            android:textColor="#2DD4BF"
            android:textSize="14sp"
            android:textStyle="bold" />

        <TextView
            android:id="@+id/tv_remaining"
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:textColor="#4ADE80"
            android:textSize="14sp"
            android:textStyle="bold" />
    </LinearLayout>

    <FrameLayout
        android:layout_width="match_parent"
        android:layout_height="6dp"
        android:layout_marginTop="6dp"
        android:layout_marginBottom="6dp">
        <ProgressBar
            android:id="@+id/progress_bar"
            style="?android:attr/progressBarStyleHorizontal"
            android:layout_width="match_parent"
            android:layout_height="match_parent"
            android:max="100"
            android:progress="0"
            android:progressDrawable="@drawable/widget_progress" />
        <ProgressBar
            android:id="@+id/progress_bar_red"
            style="?android:attr/progressBarStyleHorizontal"
            android:layout_width="match_parent"
            android:layout_height="match_parent"
            android:max="100"
            android:progress="0"
            android:visibility="gone"
            android:progressDrawable="@drawable/widget_progress_red" />
    </FrameLayout>

    <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:orientation="horizontal"
        android:gravity="center_vertical">

        <TextView
            android:id="@+id/tv_spent_total"
            android:layout_width="0dp"
            android:layout_height="wrap_content"
            android:layout_weight="1"
            android:textColor="#94A3B8"
            android:textSize="11sp" />

        <TextView
            android:id="@+id/tv_days_left"
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:textColor="#94A3B8"
            android:textSize="11sp" />
    </LinearLayout>
</LinearLayout>`;

const WIDGET_LARGE_LAYOUT_XML = `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical"
    android:gravity="center_vertical"
    android:background="@drawable/widget_bg"
    android:padding="16dp">

    <!-- Daily Budget Section -->
    <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:orientation="vertical"
        android:padding="8dp"
        android:background="@drawable/widget_inner_bg">
        
        <TextView
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:text="日常預算 / Daily Budget"
            android:textColor="#94A3B8"
            android:textSize="10sp"
            android:textStyle="bold"
            android:layout_marginBottom="4dp"/>

        <LinearLayout
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:orientation="horizontal"
            android:gravity="center_vertical">
            <TextView
                android:id="@+id/tv_percent"
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:textColor="#FFFFFF"
                android:textSize="13sp"
                android:textStyle="bold" />
            <TextView
                android:id="@+id/tv_daily"
                android:layout_width="0dp"
                android:layout_height="wrap_content"
                android:layout_weight="1"
                android:gravity="center_horizontal"
                android:textColor="#2DD4BF"
                android:textSize="14sp"
                android:textStyle="bold" />
            <TextView
                android:id="@+id/tv_remaining"
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:textColor="#4ADE80"
                android:textSize="14sp"
                android:textStyle="bold" />
        </LinearLayout>

        <FrameLayout
            android:layout_width="match_parent"
            android:layout_height="6dp"
            android:layout_marginTop="6dp"
            android:layout_marginBottom="6dp">
            <ProgressBar
                android:id="@+id/progress_bar"
                style="?android:attr/progressBarStyleHorizontal"
                android:layout_width="match_parent"
                android:layout_height="match_parent"
                android:max="100"
                android:progress="0"
                android:progressDrawable="@drawable/widget_progress" />
            <ProgressBar
                android:id="@+id/progress_bar_red"
                style="?android:attr/progressBarStyleHorizontal"
                android:layout_width="match_parent"
                android:layout_height="match_parent"
                android:max="100"
                android:progress="0"
                android:visibility="gone"
                android:progressDrawable="@drawable/widget_progress_red" />
        </FrameLayout>

        <TextView
            android:id="@+id/tv_spent_total"
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:textColor="#94A3B8"
            android:gravity="right"
            android:textSize="11sp" />
    </LinearLayout>

    <FrameLayout
        android:layout_width="match_parent"
        android:layout_height="8dp" />

    <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:orientation="horizontal">

        <LinearLayout
            android:layout_width="0dp"
            android:layout_height="wrap_content"
            android:layout_weight="1"
            android:orientation="vertical"
            android:padding="8dp"
            android:background="@drawable/widget_inner_bg">
            <TextView
                android:layout_width="match_parent"
                android:layout_height="wrap_content"
                android:text="📌 固定支出"
                android:textColor="#94A3B8"
                android:textSize="10sp"
                android:textStyle="bold"
                android:layout_marginBottom="4dp"/>
            <TextView
                android:id="@+id/tv_fixed_spent"
                android:layout_width="match_parent"
                android:layout_height="wrap_content"
                android:textColor="#64748B"
                android:textSize="14sp"
                android:textStyle="bold" />
        </LinearLayout>

        <FrameLayout
            android:layout_width="8dp"
            android:layout_height="1dp" />

        <LinearLayout
            android:layout_width="0dp"
            android:layout_height="wrap_content"
            android:layout_weight="1.2"
            android:orientation="vertical"
            android:padding="8dp"
            android:background="@drawable/widget_inner_bg">
            <TextView
                android:layout_width="match_parent"
                android:layout_height="wrap_content"
                android:text="📊 總支出"
                android:textColor="#94A3B8"
                android:textSize="10sp"
                android:textStyle="bold"
                android:layout_marginBottom="4dp"/>
            <TextView
                android:id="@+id/tv_overall_spent"
                android:layout_width="match_parent"
                android:layout_height="wrap_content"
                android:textColor="#FFFFFF"
                android:textSize="14sp"
                android:textStyle="bold" />
        </LinearLayout>
    </LinearLayout>
</LinearLayout>`;

const WIDGET_BG_XML = `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android"
    android:shape="rectangle">
    <solid android:color="#1A2332" />
    <corners android:radius="20dp" />
</shape>`;

const WIDGET_INNER_BG_XML = `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android">
    <solid android:color="#0F172A" />
    <corners android:radius="12dp" />
    <stroke android:width="1dp" android:color="#1E293B" />
</shape>`;

const WIDGET_PROGRESS_XML = `<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item android:id="@android:id/background">
        <shape android:shape="rectangle">
            <solid android:color="#334155" />
            <corners android:radius="4dp" />
        </shape>
    </item>
    <item android:id="@android:id/progress">
        <clip>
            <shape android:shape="rectangle">
                <solid android:color="#2DD4BF" />
                <corners android:radius="4dp" />
            </shape>
        </clip>
    </item>
</layer-list>`;

const WIDGET_PROGRESS_RED_XML = `<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item android:id="@android:id/background">
        <shape android:shape="rectangle">
            <solid android:color="#334155" />
            <corners android:radius="4dp" />
        </shape>
    </item>
    <item android:id="@android:id/progress">
        <clip>
            <shape android:shape="rectangle">
                <solid android:color="#EF4444" />
                <corners android:radius="4dp" />
            </shape>
        </clip>
    </item>
</layer-list>`;

const WIDGET_SMALL_INFO_XML = `<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
    android:minWidth="250dp"
    android:minHeight="60dp"
    android:targetCellWidth="4"
    android:targetCellHeight="1"
    android:updatePeriodMillis="1800000"
    android:initialLayout="@layout/widget_budget_small"
    android:resizeMode="horizontal"
    android:widgetCategory="home_screen"
    android:previewLayout="@layout/widget_budget_small"
    android:description="@string/widget_small_desc" />`;

const WIDGET_LARGE_INFO_XML = `<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
    android:minWidth="250dp"
    android:minHeight="110dp"
    android:targetCellWidth="4"
    android:targetCellHeight="2"
    android:updatePeriodMillis="1800000"
    android:initialLayout="@layout/widget_budget_large"
    android:resizeMode="horizontal|vertical"
    android:widgetCategory="home_screen"
    android:previewLayout="@layout/widget_budget_large"
    android:description="@string/widget_large_desc" />`;

const WIDGET_PROVIDER_KT = `package ${PACKAGE_NAME}

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.widget.RemoteViews
import android.content.SharedPreferences
import android.content.ComponentName
import android.app.PendingIntent
import android.content.Intent

abstract class BaseBudgetWidgetProvider(private val layoutResId: Int) : AppWidgetProvider() {
    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        for (appWidgetId in appWidgetIds) {
            updateWidget(context, appWidgetManager, appWidgetId)
        }
    }

    fun updateWidget(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int) {
        val prefs = context.getSharedPreferences("budget_widget_data", Context.MODE_PRIVATE)

        val dailyBudget = prefs.getInt("dailyBudget", 0)
        val dailySpent = prefs.getInt("dailySpent", 0)
        val dailyRemaining = prefs.getInt("dailyRemaining", 0)
        val dailyAllowance = prefs.getInt("dailyAllowance", 0)
        val dailyPercent = prefs.getInt("dailyPercent", 0)
        val isDailyOver = prefs.getBoolean("isDailyOver", false)
        val fixedSpent = prefs.getInt("fixedSpent", 0)
        val totalSpent = prefs.getInt("totalSpent", 0)
        val totalBudget = prefs.getInt("totalBudget", 0)
        val remainingDays = prefs.getInt("remainingDays", 1)

        val views = RemoteViews(context.packageName, layoutResId)

        // --- Daily Budget Row (Used in both Small & Large) ---
        views.setTextViewText(R.id.tv_percent, "\${dailyPercent}% 已花費")
        views.setTextViewText(R.id.tv_daily, "NT$ \${String.format("%,d", dailyAllowance)}/天")
        
        val remainingPrefix = if (isDailyOver) "超支 " else "結餘 "
        views.setTextViewText(R.id.tv_remaining, "\${remainingPrefix}NT$ \${String.format("%,d", Math.abs(dailyRemaining))}")

        views.setTextViewText(R.id.tv_spent_total, "日常 NT$ \${String.format("%,d", dailySpent)} / \${String.format("%,d", dailyBudget)}")
        
        // --- 4x1 Specific (Small) ---
        try { views.setTextViewText(R.id.tv_days_left, "剩餘 \${remainingDays} 天") } catch (e: Exception) {}

        // --- 4x2 Specific (Large) ---
        try {
            views.setTextViewText(R.id.tv_fixed_spent, "NT$ \${String.format("%,d", fixedSpent)}")
            views.setTextViewText(R.id.tv_overall_spent, "NT$ \${String.format("%,d", totalSpent)} / \${String.format("%,d", totalBudget)}")
        } catch (e: Exception) {}

        // Colors & Progress Bar (Daily focus)
        if (isDailyOver) {
            views.setTextColor(R.id.tv_remaining, 0xFFEF4444.toInt()) // Red
            views.setTextColor(R.id.tv_daily, 0xFFEF4444.toInt())
            views.setViewVisibility(R.id.progress_bar, android.view.View.GONE)
            views.setViewVisibility(R.id.progress_bar_red, android.view.View.VISIBLE)
            views.setProgressBar(R.id.progress_bar_red, 100, Math.min(dailyPercent, 100), false)
        } else {
            views.setTextColor(R.id.tv_remaining, 0xFF4ADE80.toInt()) // Green
            views.setTextColor(R.id.tv_daily, 0xFF2DD4BF.toInt()) // Teal
            views.setViewVisibility(R.id.progress_bar, android.view.View.VISIBLE)
            views.setViewVisibility(R.id.progress_bar_red, android.view.View.GONE)
            views.setProgressBar(R.id.progress_bar, 100, Math.min(dailyPercent, 100), false)
        }

        // Tap to open app
        val intent = context.packageManager.getLaunchIntentForPackage(context.packageName)
        if (intent != null) {
            val pendingIntent = PendingIntent.getActivity(
                context, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.tv_percent, pendingIntent)
            views.setOnClickPendingIntent(R.id.tv_daily, pendingIntent)
            views.setOnClickPendingIntent(R.id.tv_remaining, pendingIntent)
        }

        appWidgetManager.updateAppWidget(appWidgetId, views)
    }

    companion object {
        fun updateAllWidgets(context: Context) {
            val appWidgetManager = AppWidgetManager.getInstance(context)

            // Sync Small Widgets
            val smallWidgetIds = appWidgetManager.getAppWidgetIds(
                ComponentName(context, BudgetSmallWidgetProvider::class.java)
            )
            val smallProvider = BudgetSmallWidgetProvider()
            for (id in smallWidgetIds) {
                smallProvider.updateWidget(context, appWidgetManager, id)
            }

            // Sync Large Widgets
            val largeWidgetIds = appWidgetManager.getAppWidgetIds(
                ComponentName(context, BudgetLargeWidgetProvider::class.java)
            )
            val largeProvider = BudgetLargeWidgetProvider()
            for (id in largeWidgetIds) {
                largeProvider.updateWidget(context, appWidgetManager, id)
            }
        }
    }
}

class BudgetSmallWidgetProvider : BaseBudgetWidgetProvider(R.layout.widget_budget_small)
class BudgetLargeWidgetProvider : BaseBudgetWidgetProvider(R.layout.widget_budget_large)
`;

const SHARED_PREFS_MODULE_KT = `package ${PACKAGE_NAME}

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise

class SharedPreferencesModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    override fun getName(): String = "SharedPreferencesModule"

    @ReactMethod
    fun setInt(key: String, value: Int, promise: Promise) {
        try {
            val prefs = reactApplicationContext.getSharedPreferences("budget_widget_data", 0)
            prefs.edit().putInt(key, value).apply()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun setBoolean(key: String, value: Boolean, promise: Promise) {
        try {
            val prefs = reactApplicationContext.getSharedPreferences("budget_widget_data", 0)
            prefs.edit().putBoolean(key, value).apply()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun updateWidget(promise: Promise) {
        try {
            BaseBudgetWidgetProvider.updateAllWidgets(reactApplicationContext)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }
}
`;

const SHARED_PREFS_PACKAGE_KT = `package ${PACKAGE_NAME}

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class SharedPreferencesPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        return listOf(SharedPreferencesModule(reactContext))
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return emptyList()
    }
}
`;

function withBudgetWidget(config) {
    config = withDangerousMod(config, [
        'android',
        async (config) => {
            const projectRoot = config.modRequest.projectRoot;
            const androidRoot = path.join(projectRoot, 'android', 'app', 'src', 'main');
            const resRoot = path.join(androidRoot, 'res');
            const javaRoot = path.join(androidRoot, 'java', ...PACKAGE_PATH.split('/'));
            const valuesRoot = path.join(resRoot, 'values');

            [
                path.join(resRoot, 'layout'),
                path.join(resRoot, 'drawable'),
                path.join(resRoot, 'xml'),
                javaRoot,
                valuesRoot,
            ].forEach((dir) => fs.mkdirSync(dir, { recursive: true }));

            // Write Layouts
            fs.writeFileSync(path.join(resRoot, 'layout', 'widget_budget_small.xml'), WIDGET_SMALL_LAYOUT_XML);
            fs.writeFileSync(path.join(resRoot, 'layout', 'widget_budget_large.xml'), WIDGET_LARGE_LAYOUT_XML);

            // Write Drawables
            fs.writeFileSync(path.join(resRoot, 'drawable', 'widget_bg.xml'), WIDGET_BG_XML);
            fs.writeFileSync(path.join(resRoot, 'drawable', 'widget_inner_bg.xml'), WIDGET_INNER_BG_XML);
            fs.writeFileSync(path.join(resRoot, 'drawable', 'widget_progress.xml'), WIDGET_PROGRESS_XML);
            fs.writeFileSync(path.join(resRoot, 'drawable', 'widget_progress_red.xml'), WIDGET_PROGRESS_RED_XML);

            // Write Widget Info
            fs.writeFileSync(path.join(resRoot, 'xml', 'widget_budget_small_info.xml'), WIDGET_SMALL_INFO_XML);
            fs.writeFileSync(path.join(resRoot, 'xml', 'widget_budget_large_info.xml'), WIDGET_LARGE_INFO_XML);

            // Write Kotlin files
            fs.writeFileSync(path.join(javaRoot, 'BudgetWidgetProvider.kt'), WIDGET_PROVIDER_KT);
            fs.writeFileSync(path.join(javaRoot, 'SharedPreferencesModule.kt'), SHARED_PREFS_MODULE_KT);
            fs.writeFileSync(path.join(javaRoot, 'SharedPreferencesPackage.kt'), SHARED_PREFS_PACKAGE_KT);

            // Add strings
            const stringsPath = path.join(valuesRoot, 'strings.xml');
            if (fs.existsSync(stringsPath)) {
                let stringsContent = fs.readFileSync(stringsPath, 'utf-8');
                let needsWrite = false;
                if (!stringsContent.includes('widget_small_desc')) {
                    stringsContent = stringsContent.replace('</resources>', '    <string name="widget_small_desc">預算 (4x1 精簡版)</string>\n</resources>');
                    needsWrite = true;
                }
                if (!stringsContent.includes('widget_large_desc')) {
                    stringsContent = stringsContent.replace('</resources>', '    <string name="widget_large_desc">預算 (4x2 詳細版)</string>\n</resources>');
                    needsWrite = true;
                }
                if (needsWrite) fs.writeFileSync(stringsPath, stringsContent);
            } else {
                fs.writeFileSync(
                    stringsPath,
                    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <string name="widget_small_desc">預算 (4x1 精簡版)</string>\n    <string name="widget_large_desc">預算 (4x2 詳細版)</string>\n</resources>\n`
                );
            }

            // Register Package
            const mainAppPath = path.join(javaRoot, 'MainApplication.kt');
            if (fs.existsSync(mainAppPath)) {
                let mainApp = fs.readFileSync(mainAppPath, 'utf-8');
                if (!mainApp.includes('SharedPreferencesPackage')) {
                    if (!mainApp.includes('import com.facebook.react.ReactPackage')) {
                        mainApp = mainApp.replace(
                            "package " + PACKAGE_NAME,
                            "package " + PACKAGE_NAME + "\\n\\nimport com.facebook.react.ReactPackage"
                        );
                    }
                    mainApp = mainApp.replace(
                        /override val packages: List<ReactPackage>\s*\n\s*get\(\) = PackageList\(this\)\.packages/,
                        "override val packages: List<ReactPackage>\\n            get() = PackageList(this).packages.apply {\\n              add(SharedPreferencesPackage())\\n            }"
                    );
                    if (!mainApp.includes('SharedPreferencesPackage')) {
                        mainApp = mainApp.replace(
                            'PackageList(this).packages',
                            'PackageList(this).packages.apply { add(SharedPreferencesPackage()) }'
                        );
                    }
                    fs.writeFileSync(mainAppPath, mainApp);
                }
            }

            return config;
        },
    ]);

    config = withAndroidManifest(config, async (config) => {
        const manifest = config.modResults;
        const app = manifest.manifest.application[0];
        if (!app.receiver) app.receiver = [];

        // Register Small Widget
        if (!app.receiver.some(r => r.$?.['android:name'] === '.BudgetSmallWidgetProvider')) {
            app.receiver.push({
                $: { 'android:name': '.BudgetSmallWidgetProvider', 'android:exported': 'true' },
                'intent-filter': [{ action: [{ $: { 'android:name': 'android.appwidget.action.APPWIDGET_UPDATE' } }] }],
                'meta-data': [{ $: { 'android:name': 'android.appwidget.provider', 'android:resource': '@xml/widget_budget_small_info' } }],
            });
        }

        // Register Large Widget
        if (!app.receiver.some(r => r.$?.['android:name'] === '.BudgetLargeWidgetProvider')) {
            app.receiver.push({
                $: { 'android:name': '.BudgetLargeWidgetProvider', 'android:exported': 'true' },
                'intent-filter': [{ action: [{ $: { 'android:name': 'android.appwidget.action.APPWIDGET_UPDATE' } }] }],
                'meta-data': [{ $: { 'android:name': 'android.appwidget.provider', 'android:resource': '@xml/widget_budget_large_info' } }],
            });
        }

        // Remove old BudgetWidgetProvider if exists
        app.receiver = app.receiver.filter(r => r.$?.['android:name'] !== '.BudgetWidgetProvider');

        return config;
    });

    return config;
}

module.exports = withBudgetWidget;
