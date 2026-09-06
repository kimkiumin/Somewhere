import Combine
import Foundation
@preconcurrency import UserNotifications

@MainActor
final class NotificationController: NSObject, ObservableObject, UNUserNotificationCenterDelegate {
    @Published private(set) var inAppFallbackRequired = false
    private let center: UNUserNotificationCenter
    private let defaults: UserDefaults
    private let suppressScheduling: Bool
    private let fallbackDueKey = "somewhere.feedback.fallback-due-v1"

    init(
        center: UNUserNotificationCenter = .current(),
        defaults: UserDefaults = .standard,
        suppressScheduling: Bool = false
    ) {
        self.center = center
        self.defaults = defaults
        self.suppressScheduling = suppressScheduling
        super.init()
        center.delegate = self
        refreshFallback()
    }

    func scheduleDelayedFeedback(dueAt: Date) async {
        guard !suppressScheduling else { return }
        let settings = await center.notificationSettings()
        var authorized = settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional
        if settings.authorizationStatus == .notDetermined {
            authorized = (try? await center.requestAuthorization(options: [.alert, .sound])) == true
        }
        guard authorized else {
            defaults.set(dueAt.timeIntervalSince1970, forKey: fallbackDueKey)
            refreshFallback()
            return
        }
        let content = UNMutableNotificationContent()
        content.title = "어땠나요?"
        content.body = "도착지 경험을 한 번만 알려주세요."
        content.sound = .default
        let delay = max(1, dueAt.timeIntervalSinceNow)
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: delay, repeats: false)
        let request = UNNotificationRequest(identifier: "somewhere.feedback.v1", content: content, trigger: trigger)
        do { try await center.add(request) }
        catch { inAppFallbackRequired = true }
    }

    func refreshFallback(now: Date = Date()) {
        let due = defaults.double(forKey: fallbackDueKey)
        if due > 0, due <= now.timeIntervalSince1970 {
            inAppFallbackRequired = true
            defaults.removeObject(forKey: fallbackDueKey)
        }
    }

    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        await MainActor.run { self.inAppFallbackRequired = true }
        return [.banner, .sound]
    }

    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse
    ) async {
        await MainActor.run { self.inAppFallbackRequired = true }
    }
}
