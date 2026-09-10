package com.anonymous.financeappnative

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import org.json.JSONObject

class SharedPreferencesModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    override fun getName(): String = "SharedPreferencesModule"

    @ReactMethod
    fun syncWidget(payloadJson: String, promise: Promise) {
        try {
            val payload = JSONObject(payloadJson)
            val editor = reactApplicationContext.getSharedPreferences("budget_widget_data", 0).edit()
            editor.putInt("minMonthOffset", payload.optInt("minMonthOffset", -12))
            editor.putInt("maxMonthOffset", payload.optInt("maxMonthOffset", 12))
            val months = payload.optJSONObject("months") ?: JSONObject()
            val monthKeys = months.keys()
            while (monthKeys.hasNext()) {
                val prefix = monthKeys.next()
                val month = months.optJSONObject(prefix) ?: continue
                editor.putString(prefix + "monthLabel", month.optString("monthLabel", ""))
                editor.putInt(prefix + "dailyBudget", month.optInt("dailyBudget", 0))
                editor.putInt(prefix + "dailySpent", month.optInt("dailySpent", 0))
                editor.putInt(prefix + "dailyRemaining", month.optInt("dailyRemaining", 0))
                editor.putInt(prefix + "dailyAllowance", month.optInt("dailyAllowance", 0))
                editor.putInt(prefix + "dailyPercent", month.optInt("dailyPercent", 0))
                editor.putBoolean(prefix + "isDailyOver", month.optBoolean("isDailyOver", false))
                editor.putInt(prefix + "fixedSpent", month.optInt("fixedSpent", 0))
                editor.putInt(prefix + "fixedBudget", month.optInt("fixedBudget", 0))
                editor.putInt(prefix + "totalSpent", month.optInt("totalSpent", 0))
                editor.putInt(prefix + "totalBudget", month.optInt("totalBudget", 0))
                editor.putInt(prefix + "remainingDays", month.optInt("remainingDays", 1))
                editor.putString(prefix + "nextFixedName", month.optString("nextFixedName", ""))
                editor.putString(prefix + "nextFixedDate", month.optString("nextFixedDate", ""))
                editor.putInt(prefix + "nextFixedAmount", month.optInt("nextFixedAmount", 0))
            }
            editor.apply()
            BaseBudgetWidgetProvider.updateAllWidgets(reactApplicationContext)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }
}
