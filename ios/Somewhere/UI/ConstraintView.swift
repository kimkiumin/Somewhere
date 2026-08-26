import SwiftUI
import UIKit

struct ConstraintView: View {
    @ObservedObject var store: JourneyStore
    @ObservedObject private var locationController: LocationController
    @Environment(\.somewhereLayout) private var layout
    @State private var draft: SomewherePreferences
    @State private var budgetSliderValue: Double
    @State private var showsAdvanced = false
    @State private var showsProfile = false
    @State private var showsPhysicalCompass = false
    @State private var isShowingConditions = false

    init(store: JourneyStore) {
        self.store = store
        _locationController = ObservedObject(wrappedValue: store.locationController)
        let value = store.preferences.normalized
        _draft = State(initialValue: value)
        _budgetSliderValue = State(initialValue: Double(Self.index(for: value.budgetAmount)))
    }

    var body: some View {
        GeometryReader { geometry in
            Group {
                if isShowingConditions {
                    conditionsPage(height: geometry.size.height)
                        .transition(.move(edge: .trailing).combined(with: .opacity))
                } else {
                    launchPage(height: geometry.size.height, width: geometry.size.width) {
                        withAnimation(.snappy(duration: 0.32)) { isShowingConditions = true }
                    }
                    .transition(.move(edge: .leading).combined(with: .opacity))
                }
            }
            .animation(.snappy(duration: 0.32), value: isShowingConditions)
        }
        .onAppear {
            draft = store.preferences.normalized
            budgetSliderValue = Double(Self.index(for: draft.budgetAmount))
            if locationController.authorizationGranted { store.requestLocationAccess() }
        }
        .onChange(of: store.preferences) { _, value in
            draft = value.normalized
            budgetSliderValue = Double(Self.index(for: value.budgetAmount))
        }
        .sheet(isPresented: $showsProfile) {
            SomewhereBoundedSheet {
                ProfileSettingsView(profile: store.profile) { dietary, allergies in
                    store.saveProfile(dietary: dietary, allergies: allergies)
                    draft.dietary = dietary
                    draft.allergies = allergies
                }
            }
        }
        .sheet(isPresented: $showsPhysicalCompass) {
            SomewhereBoundedSheet {
                PhysicalCompassSettingsView(store: store)
            }
            .presentationDetents([.medium, .large])
        }
    }

    @ViewBuilder
    private func conditionsPage(height: CGFloat) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            conditionsHeader {
                withAnimation(.snappy(duration: 0.32)) { isShowingConditions = false }
            }
            if layout.isExhibition {
                VStack(alignment: .leading, spacing: 15) {
                    conditions
                    locationStatus
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            } else {
                ScrollView(showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 15) {
                        conditions
                        locationStatus
                    }
                    .padding(.bottom, 24)
                }
            }
        }
        .frame(minHeight: height, alignment: .top)
    }

    private func launchPage(height: CGFloat, width: CGFloat, scrollToConditions: @escaping () -> Void) -> some View {
        VStack(spacing: 0) {
            launchHeader(scrollToConditions: scrollToConditions)
            Spacer(minLength: 24)
            launchCompass(size: layout.compassDiameter)
            Spacer(minLength: 18)
            VStack(spacing: 0) {
                Text("나침반을 눌러 출발")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(SomewherePalette.mutedInk)
                Button(action: scrollToConditions) {
                    Text("탐색 조건")
                        .font(.title3.weight(.bold))
                        .underline()
                        .foregroundStyle(SomewherePalette.accent)
                        .frame(minHeight: 44)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("탐색 조건")
                .accessibilityHint("인원, 도보 시간과 예산을 조정해요.")
                .accessibilityIdentifier("somewhere.conditions-link")
            }
        }
        .frame(maxWidth: .infinity)
        .frame(minHeight: max(height, 560), alignment: .top)
    }

    private func launchHeader(scrollToConditions: @escaping () -> Void) -> some View {
        HStack(alignment: .center, spacing: 14) {
            Text(RollCompassBrand.name)
                .font(RollCompassBrand.wordmarkFont(size: 34))
                .foregroundStyle(SomewherePalette.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.72)
                .accessibilityLabel("Roll the compass")
                .accessibilityIdentifier("somewhere.logo")
            Spacer()
            Menu {
                Button {
                    showsProfile = true
                } label: {
                    Label("식이·알레르기 설정", systemImage: "person.crop.circle")
                }
                Button {
                    showsAdvanced = true
                    scrollToConditions()
                } label: {
                    Label("탐색 조건 수정", systemImage: "slider.horizontal.3")
                }
                Button {
                    showsPhysicalCompass = true
                } label: {
                    Label("물리 나침반 연결", systemImage: "dot.radiowaves.left.and.right")
                }
            } label: {
                Image(systemName: "gearshape.fill")
                    .font(.title2.weight(.semibold))
                    .foregroundStyle(SomewherePalette.accent)
                    .frame(width: 54, height: 54)
                    .background(SomewherePalette.cardStrong, in: Circle())
                    .overlay { Circle().stroke(SomewherePalette.border, lineWidth: 1) }
                    .shadow(color: SomewherePalette.ink.opacity(0.06), radius: 12, y: 6)
            }
            .accessibilityLabel("프로필 및 앱 메뉴")
            .accessibilityIdentifier("somewhere.profile-menu")
        }
        .padding(.top, 2)
    }

    private func conditionsHeader(onBack: @escaping () -> Void) -> some View {
        HStack(alignment: .center, spacing: 12) {
            Button(action: onBack) {
                Image(systemName: "chevron.left")
                    .font(.subheadline.weight(.bold))
                    .frame(width: 42, height: 42)
            }
            .buttonStyle(SomewhereSecondaryButtonStyle())
            .accessibilityLabel("출발 화면으로 돌아가기")
            .accessibilityIdentifier("somewhere.conditions-back")

            VStack(alignment: .leading, spacing: 4) {
                Text("탐색 조건")
                    .font(RollCompassBrand.wordmarkFont(size: 32))
                    .foregroundStyle(SomewherePalette.ink)
                Text("한 곳을 고르는 기준을 정해요.")
                    .font(.subheadline)
                    .foregroundStyle(SomewherePalette.mutedInk)
            }
        }
    }

    private func launchCompass(size: CGFloat) -> some View {
        SomewhereCompass(mode: store.isWorking ? .searching : .ready, size: size) {
            startJourney()
        }
            .disabled(store.isWorking)
            .opacity(store.isWorking ? 0.62 : 1)
            .accessibilityLabel("나침반을 눌러 현재 조건으로 숨은 목적지 안내 시작")
    }

    private var conditions: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text("오늘의 탐색")
                    .font(.headline.weight(.bold))
                Spacer()
                Button(showsAdvanced ? "접기" : "더 보기") {
                    withAnimation(.easeInOut(duration: 0.2)) { showsAdvanced.toggle() }
                }
                .font(.caption.weight(.semibold))
                .foregroundStyle(SomewherePalette.accent)
                .accessibilityIdentifier("somewhere.toggle-advanced")
            }
            categoryCard
            partyCard
            walkingCard
            budgetCard
            if showsAdvanced {
                advancedCard
            }
            startButton
        }
    }

    private var categoryCard: some View {
        SomewhereCard(padding: 13) {
            HStack(spacing: 12) {
                Image(systemName: "fork.knife")
                    .foregroundStyle(SomewherePalette.accent)
                    .frame(width: 28)
                VStack(alignment: .leading, spacing: 3) {
                    Text("식당 한 곳을 찾아요")
                        .font(.subheadline.weight(.semibold))
                    Text("이름은 도착할 때까지 숨겨둘게요.")
                        .font(.caption)
                        .foregroundStyle(SomewherePalette.mutedInk)
                }
                Spacer()
            }
        }
        .onAppear { draft.category = "restaurant" }
    }

    private var partyCard: some View {
        SomewhereCard(padding: 13) {
            VStack(alignment: .leading, spacing: 9) {
                HStack {
                    Label("함께 가는 인원", systemImage: "person.2.fill")
                        .font(.subheadline.weight(.semibold))
                    Spacer()
                    Text(draft.partySize == 5 ? "5명 이상" : "\(draft.partySize)명")
                        .font(.subheadline.monospacedDigit().weight(.bold))
                        .foregroundStyle(SomewherePalette.accent)
                }
                HStack(spacing: 12) {
                    Button {
                        draft.partySize = max(1, draft.partySize - 1)
                        SomewhereHaptics.selection()
                    } label: {
                        Image(systemName: "minus")
                            .frame(width: 38, height: 38)
                    }
                    .buttonStyle(SomewhereSecondaryButtonStyle())
                    .accessibilityLabel("인원 줄이기")
                    .accessibilityIdentifier("somewhere.party-decrement")
                    HStack(spacing: 5) {
                        ForEach(0..<draft.partySize, id: \.self) { _ in
                            PartyPawn()
                                .frame(width: 22, height: 29)
                                .foregroundStyle(SomewherePalette.accent)
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .accessibilityHidden(true)
                    Button {
                        draft.partySize = min(5, draft.partySize + 1)
                        SomewhereHaptics.selection()
                    } label: {
                        Image(systemName: "plus")
                            .frame(width: 38, height: 38)
                    }
                    .buttonStyle(SomewhereSecondaryButtonStyle())
                    .accessibilityLabel("인원 늘리기")
                    .accessibilityIdentifier("somewhere.party-increment")
                }
            }
        }
    }

    private var walkingCard: some View {
        SomewhereCard(padding: 13) {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Label("최대 도보 시간", systemImage: "figure.walk")
                        .font(.subheadline.weight(.semibold))
                    Spacer()
                    Text("\(draft.maxWalkMinutes)분")
                        .font(.title3.monospacedDigit().weight(.bold))
                        .foregroundStyle(SomewherePalette.accent)
                }
                Slider(
                    value: Binding(
                        get: { Double(draft.maxWalkMinutes) },
                        set: { draft.maxWalkMinutes = min(60, max(5, Int(($0 / 5).rounded()) * 5)) }
                    ),
                    in: 5...60,
                    step: 5
                )
                .tint(SomewherePalette.accent)
                .accessibilityLabel("최대 도보 시간")
                .accessibilityValue("\(draft.maxWalkMinutes)분")
                .accessibilityIdentifier("somewhere.walking-time")
                HStack {
                    Text("5분"); Spacer(); Text("60분")
                }
                .font(.caption2)
                .foregroundStyle(SomewherePalette.mutedInk)
            }
        }
    }

    private var budgetCard: some View {
        SomewhereCard(padding: 13) {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Label("1인 예산", systemImage: "wallet.pass.fill")
                        .font(.subheadline.weight(.semibold))
                    Spacer()
                    Text(draft.budgetTitle)
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(SomewherePalette.accent)
                }
                Slider(
                    value: $budgetSliderValue,
                    in: 0...Double(max(0, SomewherePreferences.budgetStops.count - 1)),
                    step: 1
                )
                .tint(SomewherePalette.accent)
                .accessibilityLabel("1인 예산")
                .accessibilityValue(draft.budgetTitle)
                .accessibilityIdentifier("somewhere.budget-slider")
                .onChange(of: budgetSliderValue) { _, value in
                    let index = min(
                        max(0, Int(value.rounded())),
                        max(0, SomewherePreferences.budgetStops.count - 1)
                    )
                    draft.budgetAmount = SomewherePreferences.budgetStops[index]
                    SomewhereHaptics.selection()
                }
                HStack {
                    Text("4,000원")
                    Spacer()
                    Text("상관없음")
                }
                .font(.caption2)
                .foregroundStyle(SomewherePalette.mutedInk)
            }
        }
    }

    private var startButton: some View {
        Button("이 조건으로 출발") {
            startJourney()
        }
        .buttonStyle(SomewherePrimaryButtonStyle())
        .accessibilityLabel("현재 조건으로 숨은 목적지 안내 시작")
        .accessibilityIdentifier("somewhere.start-journey-conditions")
        .disabled(store.isWorking)
    }

    private var advancedCard: some View {
        SomewhereCard(padding: 13) {
            VStack(alignment: .leading, spacing: 10) {
                Label("공개 수준", systemImage: "eye.slash.fill")
                    .font(.subheadline.weight(.semibold))
                Picker("공개 수준", selection: $draft.disclosure) {
                    ForEach(SomewhereDisclosure.allCases, id: \.self) { value in
                        Text(value.title).tag(value)
                    }
                }
                .pickerStyle(.segmented)
                Text(draft.disclosure.detail)
                    .font(.caption)
                    .foregroundStyle(SomewherePalette.mutedInk)
            }
        }
        .accessibilityIdentifier("somewhere.disclosure-settings")
    }

    private func startJourney() {
        guard !store.isWorking else { return }
        SomewhereHaptics.impact()
        var value = draft
        value.category = "restaurant"
        value.dietary = store.profile.dietary
        value.allergies = store.profile.allergies
        store.updatePreferences(value)
        Task { await store.start(preferences: value) }
    }

    private var locationStatus: some View {
        HStack(alignment: .center, spacing: 12) {
            Image(systemName: locationIcon)
                .font(.title3)
                .foregroundStyle(locationController.location == nil ? SomewherePalette.mutedInk : SomewherePalette.success)
                .frame(width: 24)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 3) {
                Text(locationTitle).font(.subheadline.weight(.semibold))
                Text(locationDetail)
                    .font(.caption)
                    .foregroundStyle(SomewherePalette.mutedInk)
            }
            Spacer(minLength: 8)
            if locationController.location == nil && !locationController.authorizationDenied {
                ProgressView().controlSize(.small)
            }
            if locationController.authorizationDenied || locationController.location == nil {
                Button(locationActionTitle) {
                    if locationController.authorizationDenied { openSettings() } else { store.requestLocationAccess() }
                }
                .buttonStyle(SomewhereSecondaryButtonStyle())
                .accessibilityLabel(locationActionTitle)
                .accessibilityIdentifier("somewhere.location-permission")
            }
        }
        .padding(16)
        .background(SomewherePalette.card, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay { RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(SomewherePalette.border, lineWidth: 1) }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("\(locationTitle). \(locationDetail)")
    }

    private var locationIcon: String {
        if locationController.authorizationDenied { return "location.slash" }
        if locationController.location != nil { return "location.fill" }
        return "location"
    }

    private var locationTitle: String {
        if locationController.authorizationDenied { return "위치 권한이 꺼져 있어요" }
        if locationController.location != nil { return "출발 가능" }
        if locationController.authorizationStatus == .notDetermined { return "출발 전에 위치 확인이 필요해요" }
        return "출발 위치를 찾는 중이에요"
    }

    private var locationDetail: String {
        if locationController.authorizationDenied { return "설정에서 위치를 허용하면 시작할 수 있어요." }
        if locationController.location != nil { return "현재 위치를 확인했어요." }
        if locationController.authorizationStatus == .notDetermined { return "시작 전에 한 번만 권한을 확인해 주세요." }
        return "잠시만 기다리면 현재 위치를 확인할게요."
    }

    private var locationActionTitle: String {
        locationController.authorizationDenied ? "설정 열기" : "위치 확인"
    }

    private func openSettings() {
        guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
        UIApplication.shared.open(url)
    }

    private static func index(for value: Int?) -> Int {
        SomewherePreferences.budgetStops.firstIndex(where: { $0 == value }) ?? SomewherePreferences.budgetStops.count - 1
    }
}

private struct PartyPawn: View {
    var body: some View {
        VStack(spacing: 0) {
            Circle().frame(width: 8, height: 8)
            RoundedRectangle(cornerRadius: 5).frame(width: 16, height: 15)
        }
    }
}
