import Combine
import CoreLocation
import Foundation

@MainActor
final class LocationHeadingModel: NSObject, ObservableObject, CLLocationManagerDelegate {
    @Published private(set) var authorization: CLAuthorizationStatus = .notDetermined
    @Published private(set) var location: CLLocation?
    @Published private(set) var heading: CLHeading?
    @Published private(set) var errorMessage: String?
    @Published private(set) var lastUpdatedAt: Date?
    @Published private(set) var isUpdating = false

    private let manager = CLLocationManager()
    private var shouldRun = false

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
        manager.headingFilter = 1
        authorization = manager.authorizationStatus
    }

    func start() {
        shouldRun = true
        errorMessage = nil
        authorization = manager.authorizationStatus
        updateForAuthorizationStatus()
    }

    func stop() {
        shouldRun = false
        manager.stopUpdatingLocation()
        manager.stopUpdatingHeading()
        isUpdating = false
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        authorization = manager.authorizationStatus
        updateForAuthorizationStatus()
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let latest = locations.last else {
            return
        }

        location = latest
        lastUpdatedAt = Date()
    }

    func locationManager(_ manager: CLLocationManager, didUpdateHeading newHeading: CLHeading) {
        guard newHeading.headingAccuracy >= 0 else {
            heading = nil
            errorMessage = "Heading unavailable or invalid."
            lastUpdatedAt = Date()
            return
        }

        heading = newHeading
        lastUpdatedAt = Date()
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        errorMessage = error.localizedDescription
        lastUpdatedAt = Date()
    }

    nonisolated static func bearingDelta(from current: Double, to target: Double) -> Double {
        ((target - current + 540).truncatingRemainder(dividingBy: 360)) - 180
    }

    private func updateForAuthorizationStatus() {
        switch authorization {
        case .notDetermined:
            manager.requestWhenInUseAuthorization()
        case .authorizedAlways, .authorizedWhenInUse:
            beginUpdates()
        case .denied, .restricted:
            errorMessage = "Location permission is unavailable for this diagnostic."
            stop()
        @unknown default:
            errorMessage = "Unknown location authorization status."
            stop()
        }
    }

    private func beginUpdates() {
        guard shouldRun else {
            return
        }

        manager.startUpdatingLocation()
        if CLLocationManager.headingAvailable() {
            manager.startUpdatingHeading()
        } else {
            errorMessage = "Heading is unavailable on this device."
        }
        isUpdating = true
    }
}
