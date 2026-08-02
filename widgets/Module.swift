import ExpoModulesCore
import WidgetKit

public class ReactNativeWidgetExtensionModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ReactNativeWidgetExtension")

    Function("setWidgetData") { (json: String) -> Void in
      let defaults = UserDefaults(suiteName: "group.com.chetanjain.kharcha")
      defaults?.set(json, forKey: "widgetData")
      defaults?.synchronize()
      WidgetCenter.shared.reloadAllTimelines()
    }
  }
}
