import SwiftUI

struct CompassView: View {
    @ObservedObject var store: JourneyStore
    let projection: JourneyProjection

    var body: some View {
        VStack(spacing: 0) {
            journeyHeader
            ScrollView(showsIndicators: false) {
                VStack(spacing: 22) {
                    if projection.revealed == true {
                        RevealView(projection: projection)
                    }
                    phaseHeader
                    if projection.phase == .routeRecovery {
                        RouteRecoveryView(store: store)
                    }
                    directionSummary
                    compassDial
                    distanceCard
                    safetyNote
                }
                .padding(.vertical, 18)
            }
            actionArea
        }
    }

    private var journeyHeader: some View {
        HStack {
            Button {
                if projection.actions.contains(.cancel) {
                    Task { await store.cancelSelection() }
                } else if projection.actions.contains(.stop) {
                    store.requestStop()
                }
            } label: {
                Image(systemName: "chevron.left")
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(SomewherePalette.ink)
                    .frame(width: 42, height: 42)
                    .background(SomewherePalette.cardStrong, in: Circle())
                    .overlay { Circle().stroke(SomewherePalette.border, lineWidth: 1) }
            }
            .buttonStyle(.plain)
            .accessibilityLabel("뒤로가기")
            .accessibilityIdentifier("somewhere.back")
            .disabled(!projection.actions.contains(.cancel) && !projection.actions.contains(.stop))
            VStack(alignment: .leading, spacing: 3) {
                Text(RollCompassBrand.name)
                    .font(RollCompassBrand.wordmarkFont(size: 23))
                Text("안내 중")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(SomewherePalette.mutedInk)
            }
            Spacer()
            SomewhereSignalPill(
                icon: projection.revealed == true ? "eye.fill" : "eye.slash.fill",
                title: projection.revealed == true ? "공개됨" : "보물 숨김",
                tint: projection.revealed == true ? SomewherePalette.success : SomewherePalette.accent
            )
        }
    }

    private var phaseHeader: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(phaseTitle)
                .font(.system(.title2, design: .serif).weight(.bold))
                .foregroundStyle(SomewherePalette.ink)
                .accessibilityIdentifier("somewhere.phase.\(projection.phase.rawValue)")
            Text(phaseSubtitle)
                .font(.subheadline)
                .foregroundStyle(SomewherePalette.mutedInk)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var compassDial: some View {
        SomewhereCompass(mode: compassMode, size: 286)
            .accessibilityIdentifier("somewhere.guidance-compass")
    }

    private var compassMode: SomewhereCompassMode {
        switch projection.phase {
        case .finding, .committed, .routeRecovery:
            return .searching
        case .paused:
            return .paused
        case .following, .near:
            if case .credible(let reading) = store.guidance {
                return .pointing(reading.arrowDegrees)
            }
            return .paused
        default:
            return .ready
        }
    }

    private var distanceCard: some View {
        SomewhereCard(padding: 16) {
            HStack(alignment: .center, spacing: 14) {
                Image(systemName: distanceIcon)
                    .font(.title2)
                    .foregroundStyle(SomewherePalette.accent)
                    .frame(width: 30)
                VStack(alignment: .leading, spacing: 3) {
                    Text(distanceLabel)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(SomewherePalette.mutedInk)
                    Text(distanceValue)
                        .font(.title3.monospacedDigit().weight(.bold))
                        .foregroundStyle(SomewherePalette.ink)
                        .accessibilityLabel(distanceAccessibilityLabel)
                }
                Spacer()
                if shouldShowDisclosureRows, let disclosure = projection.disclosure {
                    VStack(alignment: .trailing, spacing: 3) {
                        Text(disclosure.representativeCategories.joined(separator: " · "))
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(SomewherePalette.mutedInk)
                        Text(priceBandLabel(disclosure.priceBand))
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(SomewherePalette.gold)
                    }
                }
            }
        }
    }

    private var directionSummary: some View {
        SomewhereCard(padding: 14) {
            HStack(spacing: 12) {
                Image(systemName: directionIcon)
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(directionTint)
                    .frame(width: 30)
                VStack(alignment: .leading, spacing: 4) {
                    Text(directionTitle)
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(SomewherePalette.ink)
                    Text(directionDetail)
                        .font(.caption)
                        .foregroundStyle(SomewherePalette.mutedInk)
                }
                Spacer()
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(directionTitle). \(directionDetail)")
    }

    private var safetyNote: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "hand.raised.fill")
                .foregroundStyle(SomewherePalette.success)
            Text(projection.phase == .arrived
                ? "도착을 확인했어요. 목적지를 공개했어요."
                : "필요하면 멈춤을 누른 뒤 목적지를 확인할 수 있어요.")
                .font(.caption)
                .foregroundStyle(SomewherePalette.mutedInk)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder
    private var actionArea: some View {
        if projection.phase == .routeRecovery {
            EmptyView()
        } else {
            VStack(spacing: 10) {
                if projection.actions.contains(.commit) {
                    Button("안내 시작") {
                        SomewhereHaptics.impact()
                        Task { await store.commit() }
                    }
                    .buttonStyle(SomewherePrimaryButtonStyle())
                    .accessibilityLabel("숨은 목적지 안내 시작")
                    .accessibilityIdentifier("somewhere.commit")
                }
                if projection.actions.contains(.stop) {
                    Button("멈춤") {
                        SomewhereHaptics.impact()
                        store.requestStop()
                    }
                    .buttonStyle(SomewhereDangerButtonStyle())
                    .accessibilityLabel("여정 즉시 멈춤")
                    .accessibilityIdentifier("somewhere.stop")
                }
                HStack(spacing: 10) {
                    if projection.actions.contains(.cancel) {
                        Button("선택 취소") {
                            SomewhereHaptics.impact()
                            Task { await store.cancelSelection() }
                        }
                        .buttonStyle(SomewhereSecondaryButtonStyle())
                        .accessibilityLabel("숨은 목적지 선택 취소")
                        .accessibilityIdentifier("somewhere.cancel-selection")
                    }
                    if projection.revealed == true, projection.phase != .arrived {
                        Button("외부 지도") {
                            store.requestExternalMap()
                        }
                        .buttonStyle(SomewhereSecondaryButtonStyle())
                        .accessibilityLabel("외부 지도 열기")
                        .accessibilityIdentifier("somewhere.external-map")
                    }
                    if showsRecoveryAction {
                        Button("방향 다시 잡기") {
                            SomewhereHaptics.impact()
                            Task { await store.recoverRoute() }
                        }
                        .buttonStyle(SomewhereSecondaryButtonStyle())
                        .accessibilityLabel("방향 다시 잡기")
                        .accessibilityIdentifier("somewhere.route-recover")
                    }
                }
            }
            .padding(.top, 10)
        }
    }

    private var phaseTitle: String {
        switch projection.phase {
        case .finding: "숨은 목적지를 찾는 중"
        case .ready: "목적지가 준비됐어요"
        case .committed: "경로를 준비하는 중"
        case .following: "방향을 따라 걸어보세요"
        case .near: "거의 다 왔어요"
        case .paused: "안내를 잠시 멈췄어요"
        case .routeRecovery: "위치를 다시 확인해요"
        case .arrived: "도착했어요"
        case .stopped: "안전하게 멈췄어요"
        case .completed: "여정이 끝났어요"
        case .expired: "여정이 만료됐어요"
        }
    }

    private var phaseSubtitle: String {
        switch projection.phase {
        case .ready: "안내를 시작하면 보물의 이름은 계속 숨겨진 채로 남아요."
        case .following, .near: "화살표는 진행 방향을, 거리는 남은 길을 보여줘요."
        case .arrived: "도착을 확인해 이곳의 이름을 공개했어요."
        case .routeRecovery: "잠시 멈춰 표시가 안정되면 다시 안내받을 수 있어요."
        default: "보물은 숨기고, 지금 필요한 신호만 보여드려요."
        }
    }

    private var distanceIcon: String {
        if case .credible = store.guidance { return "location.fill" }
        return "figure.walk"
    }

    private var distanceLabel: String {
        if projection.phase == .arrived { return "도착 상태" }
        if case .credible = store.guidance { return "남은 거리" }
        return "예상 여정"
    }

    private var distanceValue: String {
        if projection.phase == .arrived { return "목적지 공개 완료" }
        if case .credible(let reading) = store.guidance { return "약 \(Int(reading.remainingM))m" }
        guard let disclosure = projection.disclosure else { return "준비 중" }
        return "약 \(Int(disclosure.routeDistanceM))m · \(Int(disclosure.routeDurationMinutes))분"
    }

    private var distanceAccessibilityLabel: String {
        if case .credible(let reading) = store.guidance { return "남은 경로 약 \(Int(reading.remainingM))미터" }
        return distanceValue
    }

    private var showsRecoveryAction: Bool {
        guard projection.actions.contains(.routeRecover) else { return false }
        if projection.phase == .routeRecovery { return true }
        guard case .suppressed(let reason) = store.guidance else { return false }
        switch reason {
        case .offRoute, .progressJump, .routeRecovering:
            return true
        default:
            return false
        }
    }

    private var shouldShowDisclosureRows: Bool {
        projection.revealed == true || store.preferences.disclosure != .privateMode
    }

    private var directionIcon: String {
        switch projection.phase {
        case .finding, .committed: return "sparkle.magnifyingglass"
        case .paused, .routeRecovery: return "location.slash.fill"
        case .near: return "flag.checkered"
        case .arrived: return "checkmark.circle.fill"
        default: return "arrow.up.right"
        }
    }

    private var directionTint: Color {
        switch projection.phase {
        case .paused, .routeRecovery: return SomewherePalette.accent
        case .near, .arrived: return SomewherePalette.success
        default: return SomewherePalette.gold
        }
    }

    private var directionTitle: String {
        switch projection.phase {
        case .finding: return "조건에 맞는 한 곳을 찾는 중"
        case .ready: return "출발하면 방향만 보여드려요"
        case .committed: return "걸을 길을 확인하는 중"
        case .following:
            if case .credible = store.guidance,
               let instruction = projection.guidance?.nextStep?.instruction,
               !instruction.isEmpty {
                return instruction
            }
            return store.guidanceTitle
        case .near: return "거의 다 왔어요"
        case .paused: return "안내를 멈췄어요"
        case .routeRecovery: return "방향을 잠시 숨겼어요"
        case .arrived: return "도착 상태를 확인했어요"
        default: return "지금 필요한 신호만 보여드려요"
        }
    }

    private var directionDetail: String {
        switch projection.phase {
        case .following:
            if case .credible = store.guidance {
                if let step = projection.guidance?.nextStep {
                    let distance = step.distanceM.map { "약 \(Int($0))m 뒤" }
                    let road = step.road.map { " · \($0)" } ?? ""
                    if let distance { return "\(distance)\(road)." }
                }
                return "화살표와 남은 거리만 가볍게 확인하세요."
            }
            return "신뢰할 수 있는 방향이 돌아오면 다시 표시할게요."
        case .near: return "주변을 살피며 마지막 거리를 천천히 확인하세요."
        case .paused: return "계속하기를 누르면 같은 여정을 이어가요."
        case .routeRecovery: return "복구 방법을 선택하기 전에는 방향을 표시하지 않아요."
        case .arrived: return "도착과 함께 목적지를 공개했어요."
        default: return "목적지 이름과 주소는 기본으로 숨겨져 있어요."
        }
    }

    private func priceBandLabel(_ value: String) -> String {
        switch value {
        case "low": return "가벼운 가격대"
        case "medium": return "보통 가격대"
        case "high": return "여유로운 가격대"
        default: return "가격대 확인 중"
        }
    }
}
