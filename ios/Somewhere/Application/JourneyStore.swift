import Combine
import Foundation

enum JourneyCommand: Equatable, Sendable {
    case create(category: String, maxWalkMinutes: Int, budgetBand: String, origin: LocationSample)
    case commit, reveal, cancelSelection, requestStop, cancelStop, confirmStop, skipStopReason, refresh
    case recoverRoute, recordArrival, requestRecovery
    case confirmRecovery(category: String, maxWalkMinutes: Int, budgetBand: String, origin: LocationSample)
    case submitFeedback(String)
}

enum JourneyStoreError: Error, Equatable, Sendable {
    case unavailable, invalidTransition, sequenceConflict, expired, protocolViolation
}

protocol JourneyServiceProtocol: Sendable {
    func perform(_ command: JourneyCommand, current: JourneyProjection?) async throws -> JourneyProjection?
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
    @Published var presentedError: JourneyStoreError?

    let locationController: LocationController
    let notificationController: NotificationController
    private let service: any JourneyServiceProtocol
    private var guidanceEngine = GuidanceEngine()
    private var arrivalGate = ArrivalGate()
    private var trustedRoute: TrustedRoute?
    private var arrivalSubmitted = false
    private var selectedConstraints: (category: String, maxWalkMinutes: Int, budgetBand: String)?
    private var pendingStartConstraints: (category: String, maxWalkMinutes: Int, budgetBand: String)?
    private var waitingForRecoveryLocation = false
    private var pendingSafetyCommands: [(JourneyCommand, Bool)] = []
    private var pollTask: Task<Void, Never>?
    private var cancellables: Set<AnyCancellable> = []

    init(
        service: any JourneyServiceProtocol,
        locationController: LocationController = LocationController(),
        notificationController: NotificationController = NotificationController()
    ) {
        self.service = service
        self.locationController = locationController
        self.notificationController = notificationController
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
                    Task { await self.start(
                        category: pending.category,
                        maxWalkMinutes: pending.maxWalkMinutes,
                        budgetBand: pending.budgetBand
                    ) }
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
    }

    func start(category: String, maxWalkMinutes: Int, budgetBand: String) async {
        selectedConstraints = (category, maxWalkMinutes, budgetBand)
        guard let origin = locationController.location else {
            pendingStartConstraints = (category, maxWalkMinutes, budgetBand)
            locationController.requestPermissionInContext()
            return
        }
        pendingStartConstraints = nil
        await execute(.create(category: category, maxWalkMinutes: maxWalkMinutes, budgetBand: budgetBand, origin: origin))
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
    func skipStopReason() async { await execute(.skipStopReason) }
    func recoverRoute() async { await execute(.recoverRoute) }
    func recordArrival() async { await execute(.recordArrival) }

    func requestRecovery() async {
        guard projection?.phase == .completed else {
            presentedError = .invalidTransition
            return
        }
        if await execute(.requestRecovery) {
            locationController.requestPermissionInContext()
            showsRecoveryReview = true
        }
    }

    func cancelRecoveryReview() { showsRecoveryReview = false }

    func confirmRecovery() async {
        guard projection?.phase == .completed,
              showsRecoveryReview,
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
        let replaced = await execute(.confirmRecovery(
            category: constraints.category,
            maxWalkMinutes: constraints.maxWalkMinutes,
            budgetBand: constraints.budgetBand,
            origin: origin
        ))
        if replaced { showsRecoveryReview = false }
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
    }

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
    }

    func updateGuidance(location: LocationSample, heading: HeadingSample, route: TrustedRoute, now: Date) {
        guard !isGuidancePaused else {
            guidance = .suppressed(.routeRecovering)
            return
        }
        guidance = guidanceEngine.update(location: location, heading: heading, route: route, now: now)
        if case .credible(let reading) = guidance, !arrivalSubmitted {
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

    private func refreshAfterSequenceConflict() async {
        guard let refreshed = try? await service.perform(.refresh, current: projection) else { return }
        applyServerProjection(refreshed)
    }
}
