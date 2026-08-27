import SwiftUI

enum SomewhereCompassMode: Equatable {
    case ready
    case searching
    case pointing(Double)
    case paused
}

enum SomewhereCompassPresentationPolicy {
    static func showsNeedle(for mode: SomewhereCompassMode) -> Bool {
        if case .pointing = mode { return true }
        return false
    }
}

enum SomewhereCompassMotionPolicy {
    static func shortestSignedDelta(from current: Double, to next: Double) -> Double {
        let delta = (next - current).truncatingRemainder(dividingBy: 360)
        if delta > 180 {
            return delta - 360
        }
        if delta < -180 {
            return delta + 360
        }
        return delta
    }

    static func unwrappedTarget(from current: Double, to next: Double) -> Double {
        current + shortestSignedDelta(from: current, to: next)
    }

    static func hubCorrection(displaySize: CGFloat, frameScale: CGFloat) -> CGSize {
        let artworkCanvas = CGFloat(1_254)
        let pivot = CGPoint(x: 627, y: 627)
        let measuredHub = CGPoint(x: 628, y: 1_000)
        let scale = displaySize * frameScale / artworkCanvas
        return CGSize(
            width: (pivot.x - measuredHub.x) * scale,
            height: (pivot.y - measuredHub.y) * scale
        )
    }

    static func shouldStartPulse(
        from previousMode: SomewhereCompassMode?,
        to nextMode: SomewhereCompassMode
    ) -> Bool {
        guard case .pointing = nextMode else { return false }
        if let previousMode, case .pointing = previousMode { return false }
        return true
    }
}

struct CompassDirectionCue: Equatable {
    let symbolName: String
    let label: String

    init(bearingDegrees: Double) {
        let normalized = bearingDegrees.isFinite
            ? bearingDegrees.truncatingRemainder(dividingBy: 360) + (bearingDegrees < 0 ? 360 : 0)
            : 0
        let sector = Int(((normalized + 22.5) / 45).rounded(.down)) % 8
        let cues = [
            ("arrow.up", "앞"),
            ("arrow.up.right", "오른쪽 앞"),
            ("arrow.right", "오른쪽"),
            ("arrow.down.right", "오른쪽 뒤"),
            ("arrow.down", "뒤"),
            ("arrow.down.left", "왼쪽 뒤"),
            ("arrow.left", "왼쪽"),
            ("arrow.up.left", "왼쪽 앞"),
        ]
        (symbolName, label) = cues[sector]
    }
}

/// One compass face is reused for launch, destination search, and route guidance.
/// The surrounding copy changes by phase; the instrument keeps the same visual grammar.
struct SomewhereCompass: View {
    let mode: SomewhereCompassMode
    let size: CGFloat
    let onActivate: (() -> Void)?

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var animatedNeedleTarget = -18.0
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

            if SomewhereCompassPresentationPolicy.showsNeedle(for: mode) {
                ZStack {
                    Image("RollCompassNeedle")
                        .resizable()
                        .interpolation(.high)
                        .antialiased(true)
                        .scaledToFit()
                        .frame(width: size * 0.44, height: size * 0.44)
                        .offset(
                            SomewhereCompassMotionPolicy.hubCorrection(
                                displaySize: size,
                                frameScale: 0.44
                            )
                        )
                }
                .frame(width: size, height: size)
                .rotationEffect(.degrees(needleAngle))
                .scaleEffect(needlePulse ? 1.025 : 0.985)
                .shadow(color: SomewherePalette.ink.opacity(0.20), radius: size * 0.012, y: size * 0.008)
                .animation(
                    reduceMotion ? nil : .spring(response: 0.42, dampingFraction: 0.76),
                    value: needleAngle
                )
                .accessibilityHidden(true)
            }
        }
        .frame(width: size, height: size)
        .contentShape(Circle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityLabel)
        .shadow(color: SomewherePalette.ink.opacity(0.13), radius: size * 0.045, y: size * 0.025)
    }

    private func syncMotion(from previousMode: SomewhereCompassMode?, to newMode: SomewhereCompassMode) {
        if case .pointing(let bearing) = newMode {
            let target = SomewhereCompassMotionPolicy.unwrappedTarget(
                from: animatedNeedleTarget,
                to: bearing
            )
            if reduceMotion {
                animatedNeedleTarget = target
                needlePulse = false
            } else {
                withAnimation(.spring(response: 0.42, dampingFraction: 0.76)) {
                    animatedNeedleTarget = target
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

    }

    private var needleAngle: Double {
        switch mode {
        case .pointing: animatedNeedleTarget
        case .ready, .searching, .paused: 0
        }
    }

    private var accessibilityLabel: String {
        switch mode {
        case .ready: "출발 준비 나침반"
        case .searching: "목적지와 경로를 확인 중"
        case .pointing(let bearing): "진행 방향 \(Int(bearing.rounded()))도"
        case .paused: "방향이 숨겨진 나침반"
        }
    }
}
