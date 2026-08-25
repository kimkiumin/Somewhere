import SwiftUI

enum SomewhereLayoutMode: String, Equatable, Sendable {
    case compact
    case exhibition
}

struct SomewhereLayoutMetrics: Equatable, Sendable {
    let mode: SomewhereLayoutMode
    let contentMaxWidth: CGFloat
    let horizontalPadding: CGFloat
    let compassDiameter: CGFloat
    let sheetMaxWidth: CGFloat
    let columnSpacing: CGFloat

    var isExhibition: Bool { mode == .exhibition }

    static func resolve(width: CGFloat, height: CGFloat, isAccessibilitySize: Bool) -> SomewhereLayoutMetrics {
        let exhibition = width >= 700 && !isAccessibilitySize
        if !exhibition {
            let contentWidth = max(280, min(520, width - 40))
            return SomewhereLayoutMetrics(
                mode: .compact,
                contentMaxWidth: contentWidth,
                horizontalPadding: 20,
                compassDiameter: min(360, contentWidth),
                sheetMaxWidth: min(520, contentWidth),
                columnSpacing: 16
            )
        }

        let padding: CGFloat = width >= 900 ? 52 : 36
        let contentWidth = min(1_080, width - padding * 2)
        let widthBound = min(520, max(410, contentWidth * 0.64))
        return SomewhereLayoutMetrics(
            mode: .exhibition,
            contentMaxWidth: contentWidth,
            horizontalPadding: padding,
            compassDiameter: min(widthBound, max(410, height * 0.44)),
            sheetMaxWidth: 620,
            columnSpacing: 28
        )
    }
}

private struct SomewhereLayoutMetricsKey: EnvironmentKey {
    static let defaultValue = SomewhereLayoutMetrics.resolve(
        width: 390,
        height: 844,
        isAccessibilitySize: false
    )
}

extension EnvironmentValues {
    var somewhereLayout: SomewhereLayoutMetrics {
        get { self[SomewhereLayoutMetricsKey.self] }
        set { self[SomewhereLayoutMetricsKey.self] = newValue }
    }
}

struct SomewhereBoundedSurface<Content: View>: View {
    @Environment(\.somewhereLayout) private var layout
    private let content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        content.frame(maxWidth: layout.contentMaxWidth).frame(maxWidth: .infinity)
    }
}

struct SomewhereBoundedSheet<Content: View>: View {
    @Environment(\.somewhereLayout) private var layout
    private let content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        content.frame(maxWidth: layout.sheetMaxWidth).frame(maxWidth: .infinity)
    }
}
