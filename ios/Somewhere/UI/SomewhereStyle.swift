import SwiftUI
import UIKit

enum SomewherePalette {
    static let canvas = Color(red: 0.985, green: 0.979, blue: 0.958)
    static let canvasDeep = Color(red: 0.90, green: 0.82, blue: 0.68)
    static let ink = Color(red: 0.10, green: 0.075, blue: 0.055)
    static let mutedInk = Color(red: 0.36, green: 0.30, blue: 0.24)
    static let accent = Color(red: 0.55, green: 0.09, blue: 0.075)
    static let gold = Color(red: 0.64, green: 0.39, blue: 0.12)
    static let success = Color(red: 0.12, green: 0.34, blue: 0.29)
    static let link = Color(red: 0.0, green: 0.39, blue: 0.94)
    static let card = Color(red: 0.965, green: 0.925, blue: 0.84).opacity(0.72)
    static let cardStrong = Color(red: 1.0, green: 0.985, blue: 0.95).opacity(0.96)
    static let border = Color(red: 0.37, green: 0.24, blue: 0.12).opacity(0.25)
}

enum RollCompassBrand {
    static let name = "Roll the compass!"

    static func wordmarkFont(size: CGFloat) -> Font {
        .custom("UnifrakturCook-Bold", size: size, relativeTo: .title)
    }
}

struct SomewhereBackground: View {
    var body: some View {
        SomewherePalette.canvas
        .ignoresSafeArea()
        .allowsHitTesting(false)
    }
}

struct SomewhereCard<Content: View>: View {
    private let padding: CGFloat
    private let content: () -> Content

    init(padding: CGFloat = 18, @ViewBuilder content: @escaping () -> Content) {
        self.padding = padding
        self.content = content
    }

    var body: some View {
        content()
            .padding(padding)
            .background(SomewherePalette.card, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .stroke(SomewherePalette.border, lineWidth: 1)
            }
            .shadow(color: .black.opacity(0.04), radius: 20, y: 8)
    }
}

struct SomewhereSignalPill: View {
    let icon: String
    let title: String
    var tint: Color = SomewherePalette.ink

    var body: some View {
        Label(title, systemImage: icon)
            .font(.caption2.weight(.semibold))
            .foregroundStyle(tint)
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .background(tint.opacity(0.10), in: Capsule())
    }
}

struct SomewherePrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.body.weight(.semibold))
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity, minHeight: 54)
            .background(SomewherePalette.accent, in: Capsule())
            .shadow(color: SomewherePalette.accent.opacity(0.22), radius: 14, y: 7)
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .opacity(configuration.isPressed ? 0.88 : 1)
            .animation(.easeOut(duration: 0.16), value: configuration.isPressed)
    }
}

struct SomewhereSecondaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(SomewherePalette.ink)
            .frame(minHeight: 46)
            .padding(.horizontal, 14)
            .background(SomewherePalette.cardStrong, in: Capsule())
            .overlay {
                Capsule().stroke(SomewherePalette.border, lineWidth: 1)
            }
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .opacity(configuration.isPressed ? 0.78 : 1)
            .animation(.easeOut(duration: 0.16), value: configuration.isPressed)
    }
}

struct SomewhereDangerButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.body.weight(.semibold))
            .foregroundStyle(SomewherePalette.accent)
            .frame(maxWidth: .infinity, minHeight: 54)
            .background(SomewherePalette.cardStrong, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .stroke(SomewherePalette.accent, lineWidth: 1.5)
            }
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .opacity(configuration.isPressed ? 0.78 : 1)
            .animation(.easeOut(duration: 0.16), value: configuration.isPressed)
    }
}

struct SomewhereReactionButtonStyle: ButtonStyle {
    let tint: Color

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.body.weight(.semibold))
            .foregroundStyle(tint)
            .frame(maxWidth: .infinity, minHeight: 112)
            .background(tint.opacity(0.08), in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .stroke(tint.opacity(0.32), lineWidth: 1)
            }
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .opacity(configuration.isPressed ? 0.78 : 1)
            .animation(.easeOut(duration: 0.16), value: configuration.isPressed)
    }
}

@MainActor
enum SomewhereHaptics {
    static func selection() {
        let generator = UISelectionFeedbackGenerator()
        generator.prepare()
        generator.selectionChanged()
    }

    static func success() {
        let generator = UINotificationFeedbackGenerator()
        generator.prepare()
        generator.notificationOccurred(.success)
    }

    static func impact() {
        let generator = UIImpactFeedbackGenerator(style: .light)
        generator.prepare()
        generator.impactOccurred()
    }
}
