import Combine
import Foundation
import UIKit

enum JourneyCommand: Equatable, Sendable {
    case create(category: String, maxWalkMinutes: Int, budgetBand: String, origin: LocationSample)
    case createWithPreferences(SomewherePreferences, origin: LocationSample)
    case commit, reveal, cancelSelection, requestStop, cancelStop, confirmStop, skipStopReason, refresh
    case recordStopReason(String)
    case recoverRoute, recordArrival, requestRecovery
    case recoverRouteWithChoice(String)
    case confirmRecovery(category: String, maxWalkMinutes: Int, budgetBand: String, origin: LocationSample)
    case confirmRecoveryWithPreferences(SomewherePreferences, origin: LocationSample)
    case submitFeedback(String)
}

enum JourneyStoreError: Error, Equatable, Sendable {
    case unavailable, invalidTransition, sequenceConflict, expired, protocolViolation, noFit
}

protocol JourneyServiceProtocol: Sendable {
    func perform(_ command: JourneyCommand, current: JourneyProjection?) async throws -> JourneyProjection?
}

@MainActor
private final class InertPhysicalCompassClient: PhysicalCompassClient {
    var onConnectionState: ((PhysicalCompassConnectionState) -> Void)?
    var onEvent: ((PhysicalCompassEvent) -> Void)?

    func start() {}
    func stop() {}
    func send(_ snapshot: PhysicalCompassSnapshot) {}
}

@MainActor
final class JourneyStore: ObservableObject {
    @Published private(set) var projection: JourneyProjection?
    @Published private(set) var isWorking = false
    @Published private(set) var isGuidancePaused = false
    @Published private(set) var guidance: GuidanceResult = .suppressed(.invalidRoute)
    @Published var showsStopConfirmation = false
    @Published var showsFeedback = false
    @Published var showsRecoveryReview = false
    @Published var showsRevealReason = false
    @Published var showsExternalMapWarning = false
    @Published var showsProfileSetup = false
    @Published var showsNoFit = false
    @Published var recoveryReviewAcknowledged = false
    @Published var presentedError: JourneyStoreError?
    @Published private(set) var preferences: SomewherePreferences
    @Published private(set) var profile: SomewhereProfile
    @Published private(set) var isOnboardingRequired: Bool
    @Published private(set) var noFitConditions: [SomewhereConditionIssue] = []
    @Published private(set) var lastRevealReason: String?
    @Published private(set) var lastStopReason: String?
    @Published private(set) var physicalCompassConnectionState: PhysicalCompassConnectionState = .disabled
    @Published private(set) var isPhysicalCompassHostEnabled: Bool

    let locationController: LocationController
    let notificationController: NotificationController
    let physicalCompass: any PhysicalCompassClient
    private let service: any JourneyServiceProtocol
    private let physicalCompassDefaults: UserDefaults
    private var guidanceEngine = GuidanceEngine()
    private var arrivalGate = ArrivalGate()
    private var trustedRoute: TrustedRoute?
    private var arrivalSubmitted = false
    private var selectedConstraints: SomewherePreferences?
    private var pendingStartConstraints: SomewherePreferences?
    private var waitingForRecoveryLocation = false
    private var pendingSafetyCommands: [(JourneyCommand, Bool)] = []
    private var pollTask: Task<Void, Never>?
    private var cancellables: Set<AnyCancellable> = []
    private var physicalCompassSequence = 0
    private var lastPhysicalCompassSnapshot: PhysicalCompassSnapshot?

    init(
        service: any JourneyServiceProtocol,
        locationController: LocationController = LocationController(),
        notificationController: NotificationController = NotificationController(),
        physicalCompass: any PhysicalCompassClient = InertPhysicalCompassClient(),
        physicalCompassDefaults: UserDefaults = .standard,
        physicalCompassHostEnabled: Bool? = nil
    ) {
        self.service = service
        self.locationController = locationController
        self.notificationController = notificationController
        self.physicalCompass = physicalCompass
        self.physicalCompassDefaults = physicalCompassDefaults
        self.isPhysicalCompassHostEnabled = physicalCompassHostEnabled
            ?? PhysicalCompassHostPersistence.load(defaults: physicalCompassDefaults)
        self.preferences = SomewherePreferencesPersistence.loadPreferences()
        self.profile = SomewherePreferencesPersistence.loadProfile()
        self.isOnboardingRequired = !SomewherePreferencesPersistence.hasCompletedOnboarding()
        notificationController.$inAppFallbackRequired
            .receive(on: RunLoop.main)
            .sink { [weak self] value in if value { self?.showsFeedback = true } }
            .store(in: &cancellables)
        locationController.$location.combineLatest(locationController.$heading)
            .receive(on: RunLoop.main)
            .sink { [weak self] location, heading in
                guard let self, let location, let heading, let route = self.trustedRoute else { return }
                self.updateGuidance(location: location, heading: heading, route: route, now: Date())
            }
            .store(in: &cancellables)
        locationController.$location.compactMap { $0 }
            .receive(on: RunLoop.main)
            .sink { [weak self] _ in
                guard let self else { return }
                if let pending = self.pendingStartConstraints, self.projection == nil, !self.isWorking {
                    self.pendingStartConstraints = nil
                    Task { await self.start(preferences: pending) }
                } else if self.waitingForRecoveryLocation, !self.isWorking {
                    self.waitingForRecoveryLocation = false
                    Task { await self.confirmRecovery() }
                }
            }
            .store(in: &cancellables)
        locationController.$authorizationDenied
            .receive(on: RunLoop.main)
            .sink { [weak self] denied in if denied { self?.presentedError = .unavailable } }
            .store(in: &cancellables)
        physicalCompass.onConnectionState = { [weak self] state in
            self?.handlePhysicalCompassConnectionState(state)
        }
        physicalCompass.onEvent = { [weak self] event in
            self?.handlePhysicalCompassEvent(event)
        }
        if isPhysicalCompassHostEnabled {
            physicalCompass.start()
        }
    }

    func setPhysicalCompassHostEnabled(_ enabled: Bool) {
        guard enabled != isPhysicalCompassHostEnabled else { return }
        isPhysicalCompassHostEnabled = enabled
        PhysicalCompassHostPersistence.save(enabled, defaults: physicalCompassDefaults)
        lastPhysicalCompassSnapshot = nil
        if enabled {
            physicalCompassConnectionState = .scanning
            physicalCompass.start()
        } else {
            physicalCompass.stop()
            physicalCompassConnectionState = .disabled
        }
    }

    func start(category: String, maxWalkMinutes: Int, budgetBand: String) async {
        var value = preferences
        value.category = category
        value.maxWalkMinutes = max(5, min(60, maxWalkMinutes))
        value.budgetAmount = switch budgetBand {
        case "low": 8_000
        case "medium": 14_000
        case "high": 30_000
        default: nil
        }
        await start(preferences: value)
    }

    func start(preferences value: SomewherePreferences) async {
        let normalized = value.normalized
        self.preferences = normalized
        noFitConditions = []
        showsNoFit = false
        SomewherePreferencesPersistence.savePreferences(normalized)
        selectedConstraints = normalized
        guard let origin = locationController.location else {
            pendingStartConstraints = normalized
            locationController.requestPermissionInContext()
            return
        }
        pendingStartConstraints = nil
        let created = await execute(.createWithPreferences(normalized, origin: origin))
        guard created,
              projection?.phase == .ready,
              projection?.actions.contains(.commit) == true else { return }
        await execute(.commit)
    }

    func updatePreferences(_ value: SomewherePreferences) {
        let normalized = value.normalized
        preferences = normalized
        SomewherePreferencesPersistence.savePreferences(normalized)
    }

    func saveProfile(dietary: [String], allergies: [String]) {
        let value = SomewhereProfile(
            dietary: Array(Set(dietary)).sorted(),
            allergies: Array(Set(allergies)).sorted()
        )
        profile = value
        SomewherePreferencesPersistence.saveProfile(value)
        showsProfileSetup = false
        var updated = preferences
        updated.dietary = value.dietary
        updated.allergies = value.allergies
        updatePreferences(updated)
    }

    func completeOnboarding() {
        isOnboardingRequired = false
        SomewherePreferencesPersistence.markOnboardingCompleted()
        if !SomewherePreferencesPersistence.hasCompletedProfile() {
            showsProfileSetup = true
        }
    }

    func requestLocationAccess() {
        locationController.requestPermissionInContext()
    }

    func commit() async { await execute(.commit) }
    func cancelSelection() async { await execute(.cancelSelection) }

    func requestStop() {
        isGuidancePaused = true
        showsStopConfirmation = true
        Task { await execute(.requestStop, retainLocalPauseOnFailure: true) }
    }

    func cancelStop() async {
        await execute(.cancelStop)
        if projection?.phase != .paused {
            isGuidancePaused = false
            showsStopConfirmation = false
        }
    }

    func confirmStop() async {
        await execute(.confirmStop, retainLocalPauseOnFailure: true)
        if projection?.phase == .stopped || projection?.phase == .completed {
            showsStopConfirmation = false
        }
    }

    func reveal() async { await execute(.reveal) }
    func requestReveal() {
        if projection?.revealed == true {
            return
        }
        showsRevealReason = true
    }

    func submitRevealReason(_ reason: String) async {
        showsRevealReason = false
        lastRevealReason = reason
        await execute(.reveal)
    }

    func skipStopReason() async {
        lastStopReason = "skip"
        await execute(.skipStopReason)
    }
    func submitStopReason(_ reason: String) async {
        lastStopReason = reason
        await execute(.recordStopReason(reason))
    }
    func recoverRoute() async { await execute(.recoverRoute) }
    func recoverRoute(choice: String) async { await execute(.recoverRouteWithChoice(choice)) }
    func recordArrival() async { await execute(.recordArrival) }

    func requestExternalMap() {
        showsExternalMapWarning = true
    }

    func confirmExternalMapHandoff() async {
        showsExternalMapWarning = false
        if projection?.revealed != true {
            await execute(.reveal)
        }
        if projection?.phase == .paused || projection?.phase == .routeRecovery {
            await execute(.recoverRouteWithChoice("external-map"))
        }
        guard let address = projection?.reveal?.address,
              var components = URLComponents(string: "http://maps.apple.com/") else { return }
        components.queryItems = [URLQueryItem(name: "address", value: address)]
        guard let url = components.url else { return }
        await MainActor.run { UIApplication.shared.open(url) }
    }

    func requestRecovery() async {
        guard projection?.phase == .completed else {
            presentedError = .invalidTransition
            return
        }
        if await execute(.requestRecovery) {
            locationController.requestPermissionInContext()
            recoveryReviewAcknowledged = false
            showsRecoveryReview = true
        }
    }

    func cancelRecoveryReview() {
        showsRecoveryReview = false
        recoveryReviewAcknowledged = false
    }

    func confirmRecovery() async {
        guard projection?.phase == .completed,
              showsRecoveryReview,
              recoveryReviewAcknowledged,
              let constraints = selectedConstraints else {
            presentedError = .invalidTransition
            return
        }
        guard let origin = locationController.location else {
            waitingForRecoveryLocation = true
            locationController.requestPermissionInContext()
            return
        }
        waitingForRecoveryLocation = false
        let replaced = await execute(.confirmRecoveryWithPreferences(constraints, origin: origin))
        if replaced {
            showsRecoveryReview = false
            recoveryReviewAcknowledged = false
        }
    }

    func submitFeedback(_ reaction: String) async { await execute(.submitFeedback(reaction)) }
    func dismissError() { presentedError = nil }

    func resetLocal() {
        pollTask?.cancel()
        projection = nil
        trustedRoute = nil
        selectedConstraints = nil
        pendingStartConstraints = nil
        waitingForRecoveryLocation = false
        guidanceEngine = GuidanceEngine()
        arrivalGate = ArrivalGate()
        arrivalSubmitted = false
        guidance = .suppressed(.invalidRoute)
        presentedError = nil
        showsRevealReason = false
        showsExternalMapWarning = false
        showsNoFit = false
        recoveryReviewAcknowledged = false
        noFitConditions = []
        lastRevealReason = nil
        lastStopReason = nil
        syncPhysicalCompass()
    }

    func reviewNoFit() {
        resetLocal()
    }

    #if DEBUG
    func presentNoFitForTesting() {
        noFitConditions = [
            .init(id: "budget", title: "예산"),
            .init(id: "dietary", title: "식이 조건"),
        ]
        showsNoFit = true
    }

    func presentRecoveryReviewForTesting() {
        recoveryReviewAcknowledged = false
        showsRecoveryReview = true
    }

    func presentFeedbackForTesting() {
        showsFeedback = true
    }

    func presentErrorForTesting() {
        presentedError = .unavailable
    }

    func presentGuidanceForTesting(bearing: Double = 315, remainingM: Double = 420) {
        isGuidancePaused = false
        guidance = .credible(GuidanceReading(
            arrowDegrees: bearing,
            remainingM: remainingM,
            endpointDistanceM: remainingM,
            finalCorridorDeviationM: 0,
            routeProgressIsCredible: true
        ))
        syncPhysicalCompass()
    }
    #endif

    func applyServerProjection(_ value: JourneyProjection) {
        pollTask?.cancel()
        projection = value
        isGuidancePaused = value.phase == .paused || value.phase == .stopped || value.phase == .completed || value.phase == .expired
        locationController.apply(phase: value.phase)
        if let route = value.guidance, route.kind == "route" {
            trustedRoute = try? TrustedRoute.validate(guidance: route, receivedAt: Date(), now: Date())
        } else if value.phase == .routeRecovery || value.phase == .stopped || value.phase == .expired {
            trustedRoute = nil
            guidanceEngine = GuidanceEngine()
        }
        if value.phase == .arrived, let dueAt = value.feedbackDueAt {
            Task { await notificationController.scheduleDelayedFeedback(dueAt: Date(timeIntervalSince1970: Double(dueAt) / 1000)) }
        }
        if (value.phase == .finding || value.phase == .committed), let delay = value.pollAfterSeconds {
            pollTask = Task { [weak self] in
                try? await Task.sleep(for: .seconds(delay))
                guard !Task.isCancelled else { return }
                await self?.execute(.refresh)
            }
        }
        syncPhysicalCompass()
    }

    func updateGuidance(location: LocationSample, heading: HeadingSample, route: TrustedRoute, now: Date) {
        guard !isGuidancePaused else {
            let pausedGuidance = GuidanceResult.suppressed(.routeRecovering)
            if guidance != pausedGuidance {
                guidance = pausedGuidance
            }
            syncPhysicalCompass()
            return
        }
        let nextGuidance = guidanceEngine.update(location: location, heading: heading, route: route, now: now)
        if guidance != nextGuidance {
            guidance = nextGuidance
        }
        if case .credible(let reading) = nextGuidance, !arrivalSubmitted {
            let arrived = arrivalGate.advance(sample: ArrivalSample(
                endpointDistanceM: reading.endpointDistanceM,
                accuracyM: location.horizontalAccuracyM,
                finalCorridorDeviationM: reading.finalCorridorDeviationM,
                capturedAt: location.capturedAt,
                routeIsFresh: route.expiresAt > now,
                progressIsCredible: reading.routeProgressIsCredible
            ))
            if arrived {
                arrivalSubmitted = true
                Task { await execute(.recordArrival) }
            }
        }
        syncPhysicalCompass()
    }

    var guidanceTitle: String {
        switch guidance {
        case .credible:
            return "화살표를 따라가요"
        case .suppressed(.offRoute), .suppressed(.progressJump):
            return "경로에서 벗어났어요"
        case .suppressed(.poorLocationAccuracy), .suppressed(.staleLocation):
            return "위치를 다시 확인하는 중"
        case .suppressed(.poorHeadingAccuracy), .suppressed(.invalidHeading), .suppressed(.staleHeading):
            return "나침반을 다시 확인하는 중"
        case .suppressed(.routeRecovering):
            return "경로를 다시 맞추는 중"
        case .suppressed:
            return "방향을 확인하는 중"
        }
    }

    @discardableResult
    private func execute(_ command: JourneyCommand, retainLocalPauseOnFailure: Bool = false) async -> Bool {
        if isWorking {
            switch command {
            case .requestStop, .cancelStop, .confirmStop:
                pendingSafetyCommands.append((command, retainLocalPauseOnFailure))
            default:
                break
            }
            return false
        }
        isWorking = true
        do {
            let next = try await service.perform(command, current: projection)
            if case .submitFeedback = command, next == nil {
                showsFeedback = false
            } else if case .cancelSelection = command, next == nil {
                resetLocal()
            } else if let next {
                applyServerProjection(next)
            } else {
                throw JourneyStoreError.protocolViolation
            }
            presentedError = nil
        } catch let error as JourneyStoreError {
            presentedError = error
            if error == .noFit {
                noFitConditions = conditionIssues(for: selectedConstraints ?? preferences)
                showsNoFit = true
            }
            if error == .sequenceConflict { await refreshAfterSequenceConflict() }
            if !retainLocalPauseOnFailure { isGuidancePaused = projection?.phase == .paused }
        } catch {
            presentedError = .unavailable
            if !retainLocalPauseOnFailure { isGuidancePaused = projection?.phase == .paused }
        }
        isWorking = false
        if !pendingSafetyCommands.isEmpty {
            let pending = pendingSafetyCommands.removeFirst()
            await execute(pending.0, retainLocalPauseOnFailure: pending.1)
        }
        return presentedError == nil
    }

    private func conditionIssues(for value: SomewherePreferences) -> [SomewhereConditionIssue] {
        var issues: [SomewhereConditionIssue] = []
        if value.partySize != SomewherePreferences.defaults.partySize {
            issues.append(.init(id: "partySize", title: "함께 가는 인원"))
        }
        if value.maxWalkMinutes != SomewherePreferences.defaults.maxWalkMinutes {
            issues.append(.init(id: "maxWalkMinutes", title: "최대 도보 시간"))
        }
        if value.budgetAmount != nil {
            issues.append(.init(id: "budget", title: "예산"))
        }
        if !value.dietary.isEmpty {
            issues.append(.init(id: "dietary", title: "식이 조건"))
        }
        if !value.allergies.isEmpty {
            issues.append(.init(id: "allergies", title: "알레르기"))
        }
        if value.disclosure == .privateMode {
            issues.append(.init(id: "disclosure", title: "목적지 공개 수준"))
        }
        return issues.isEmpty
            ? [.init(id: "maxWalkMinutes", title: "최대 도보 시간")]
            : issues
    }

    private func refreshAfterSequenceConflict() async {
        guard let refreshed = try? await service.perform(.refresh, current: projection) else { return }
        applyServerProjection(refreshed)
    }

    private func handlePhysicalCompassEvent(_ event: PhysicalCompassEvent) {
        guard isPhysicalCompassHostEnabled,
              physicalCompassConnectionState == .connected,
              let snapshot = lastPhysicalCompassSnapshot,
              let projection,
              case .action(let action, let sequence) = event,
              sequence == snapshot.sequence else { return }

        switch action {
        case .stop:
            guard projection.actions.contains(.stop) else { return }
            requestStop()
        case .continue:
            guard projection.actions.contains(.continue) else { return }
            Task { await cancelStop() }
        case .confirmStop:
            guard projection.actions.contains(.confirmStop) else { return }
            Task { await confirmStop() }
        case .reveal:
            guard projection.actions.contains(.reveal) else { return }
            requestReveal()
        }
    }

    private func handlePhysicalCompassConnectionState(_ state: PhysicalCompassConnectionState) {
        guard isPhysicalCompassHostEnabled else {
            physicalCompassConnectionState = .disabled
            lastPhysicalCompassSnapshot = nil
            return
        }
        physicalCompassConnectionState = state
        switch state {
        case .connected:
            break
        case .stale:
            lastPhysicalCompassSnapshot = nil
            syncPhysicalCompass()
        case .disabled, .unavailable, .disconnected, .scanning, .connecting:
            lastPhysicalCompassSnapshot = nil
        }
    }

    private func syncPhysicalCompass() {
        guard isPhysicalCompassHostEnabled else {
            lastPhysicalCompassSnapshot = nil
            return
        }
        let nextSequence = physicalCompassSequence + 1
        let remainingDistanceM: Double?
        let bearingDegrees: Double?
        let confidence: String
        switch guidance {
        case .credible(let reading):
            remainingDistanceM = reading.remainingM
            bearingDegrees = reading.arrowDegrees
            confidence = "credible"
        case .suppressed(let reason):
            remainingDistanceM = projection?.disclosure?.routeDistanceM
            bearingDegrees = nil
            confidence = reason.rawValue
        }

        let menus = Array((projection?.disclosure?.representativeCategories ?? []).prefix(2)).map {
            PhysicalCompassWire.truncateDisplayText($0)
        }
        let priceBand = projection?.disclosure.map {
            PhysicalCompassWire.truncateDisplayText($0.priceBand)
        }
        let actions = JourneyAction.allCases.compactMap { action -> PhysicalCompassAction? in
            guard projection?.actions.contains(action) == true else { return nil }
            switch action {
            case .stop: return .stop
            case .continue: return .continue
            case .confirmStop: return .confirmStop
            case .reveal: return .reveal
            default: return nil
            }
        }

        guard let snapshot = try? PhysicalCompassSnapshot(
            sequence: nextSequence,
            phase: projection?.phase.rawValue ?? "idle",
            remainingDistanceM: remainingDistanceM,
            bearingDegrees: bearingDegrees,
            confidence: confidence,
            menus: menus,
            priceBand: priceBand,
            actions: actions,
            revealed: projection?.revealed == true,
            timestampMs: Int64(Date().timeIntervalSince1970 * 1000)
        ) else { return }
        guard snapshot != lastPhysicalCompassSnapshot else { return }
        physicalCompassSequence = nextSequence
        lastPhysicalCompassSnapshot = snapshot
        physicalCompass.send(snapshot)
    }
}
