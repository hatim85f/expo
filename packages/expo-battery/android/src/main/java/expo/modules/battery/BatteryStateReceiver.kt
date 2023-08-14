package expo.modules.battery

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.BatteryManager
import android.os.Bundle

class BatteryStateReceiver(private val sendEvent: (name: String, body: Bundle) -> Unit) : BroadcastReceiver() {
  private fun onBatteryStateChange(batteryState: BatteryModule.BatteryState) {
    sendEvent(
      BATTERY_CHARGED_EVENT_NAME,
      Bundle().apply {
        putInt("batteryState", batteryState.value)
      }
    )
  }

  override fun onReceive(context: Context, intent: Intent) {
    val status = intent.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
    val bs = batteryStatusNativeToJS(status)
    onBatteryStateChange(bs)
  }
}
