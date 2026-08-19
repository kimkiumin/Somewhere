import SwiftUI

enum SomewhereCompassMode: Equatable {
    case ready
    case searching
    case pointing(Double)
    case paused
}

enum SomewhereCompassMotionPolicy {
    static func shouldStartPulse(
        from previousMode: SomewhereCompassMode?,
        to nextMode: SomewhereCompassMode
    ) -> Bool {
        guard case .pointing = nextMode else { return false }
        if let previousMode, case .pointing = previousMode { return false }
        return true
    }
}

/// One compass face is reused for launch, destination search, and route guidance.
/// The surrounding copy changes by phase; the instrument keeps the same visual grammar.
struct SomewhereCompass: View {
    let mode: SomewhereCompassMode
    let size: CGFloat
    let onActivate: (() -> Void)?

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var searchingRotation = 0.0
    @State private var animatedBearing = -18.0
    @State private var needlePulse = false

    init(
        mode: SomewhereCompassMode,
        size: CGFloat = 236,
        onActivate: (() -> Void)? = nil
    ) {
        self.mode = mode
        self.size = size
        self.onActivate = onActivate
    }

    var body: some View {
        Group {
            if let onActivate {
                Button(action: onActivate) {
                    face
                }
                .buttonStyle(.plain)
                .accessibilityLabel("이 조건으로 바로 출발")
                .accessibilityHint("나침반을 누르면 숨은 목적지 안내를 시작해요.")
                .accessibilityIdentifier("somewhere.start-journey")
            } else {
                face
            }
        }
        .onAppear {
            syncMotion(from: nil, to: mode)
        }
        .onChange(of: mode) { oldMode, newMode in
            syncMotion(from: oldMode, to: newMode)
        }
    }

    private var face: some View {
        ZStack {
            Image("RollCompassShell")
                .resizable()
                .interpolation(.high)
                .antialiased(true)
                .scaledToFit()
                .frame(width: size, height: size)
                .accessibilityHidden(true)

            Image("RollCompassNeedle")
                .resizable()
                .interpolation(.high)
                .antialiased(true)
                .scaledToFit()
                .frame(width: size * 0.68, height: size * 0.68)
                .rotationEffect(.degrees(needleAngle))
                .scaleEffect(needlePulse ? 1.025 : 0.985)
                .grayscale(isPaused ? 0.84 : 0)
                .opacity(isPaused ? 0.62 : 1)
                .shadow(color: SomewherePalette.ink.opacity(0.20), radius: size * 0.012, y: size * 0.008)
                .animation(
                    reduceMotion ? nil : .spring(response: 0.42, dampingFraction: 0.76),
                    value: needleAngle
                )
                .accessibilityHidden(true)
        }
        .frame(width: size, height: size)
        .contentShape(Circle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityLabel)
        .shadow(color: SomewherePalette.ink.opacity(0.13), radius: size * 0.045, y: size * 0.025)
    }

    private func syncMotion(from previousMode: SomewhereCompassMode?, to newMode: SomewhereCompassMode) {
        if case .pointing(let bearing) = newMode {
            if reduceMotion {
                animatedBearing = bearing
                needlePulse = false
            } else {
                withAnimation(.spring(response: 0.42, dampingFraction: 0.76)) {
                    animatedBearing = bearing
                }
                if SomewhereCompassMotionPolicy.shouldStartPulse(from: previousMode, to: newMode) {
                    withAnimation(.easeInOut(duration: 1.15).repeatForever(autoreverses: true)) {
                        needlePulse = true
                    }
                }
            }
        } else {
            needlePulse = false
        }

        guard !reduceMotion else {
            searchingRotation = 0
            return
        }

        if case .searching = newMode {
            searchingRotation = 0
            withAnimation(.linear(duration: 2.4).repeatForever(autoreverses: false)) {
                searchingRotation = 360
            }
        } else {
            searchingRotation = 0
        }
    }

    private var needleAngle: Double {
        switch mode {
        case .ready: -18
        case .searching: searchingRotation
        case .pointing: animatedBearing
        case .paused: animatedBearing
        }
    }

    private var isPaused: Bool {
        if case .paused = mode { return true }
        return false
    }

    private var accessibilityLabel: String {
        switch mode {
        case .ready: "출발 준비 나침반"
        case .searching: "목적지와 경로를 확인 중"
        case .pointing(let bearing): "진행 방향 \(Int(bearing.rounded()))도"
        case .paused: "방향 안내 일시정지"
        }
    }
}
