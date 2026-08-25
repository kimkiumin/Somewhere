import SwiftUI

struct ArrivalView: View {
    @ObservedObject var store: JourneyStore
    let projection: JourneyProjection
    @Environment(\.somewhereLayout) private var layout

    var body: some View {
        Group {
            if layout.isExhibition {
                adaptiveContent
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            } else {
                ScrollView(showsIndicators: false) {
                    adaptiveContent
                        .padding(.vertical, 8)
                }
            }
        }
        .task(id: projection.sequence) {
            if projection.revealed != true, projection.actions.contains(.reveal) {
                await store.reveal()
            }
        }
    }

    @ViewBuilder
    private var adaptiveContent: some View {
        if layout.isExhibition {
            HStack(alignment: .top, spacing: layout.columnSpacing) {
                primaryPane.frame(maxWidth: .infinity)
                secondaryPane.frame(maxWidth: .infinity)
            }
        } else {
            VStack(spacing: 16) {
                primaryPane
                secondaryPane
            }
        }
    }

    @ViewBuilder
    private var primaryPane: some View {
        VStack(spacing: 16) {
            if layout.isExhibition {
                HStack {
                    Spacer()
                    arrivalStatus
                }
            } else {
                arrivalHeader
            }

            if projection.revealed == true {
                RevealView(projection: projection)
            } else {
                ProgressView()
                    .controlSize(.large)
                    .tint(SomewherePalette.accent)
                Text("도착지를 공개하는 중이에요")
                    .font(.title3.weight(.bold))
                    .foregroundStyle(SomewherePalette.ink)
            }
        }
    }

    @ViewBuilder
    private var secondaryPane: some View {
        VStack(spacing: 16) {
            if layout.isExhibition {
                HStack {
                    externalMapButton
                    Spacer()
                }
            }
            if projection.revealed == true {
                completionNote
            }
        }
    }

    private var arrivalHeader: some View {
        HStack {
            externalMapButton
            Spacer()
            arrivalStatus
        }
    }

    private var arrivalStatus: some View {
        SomewhereSignalPill(icon: "checkmark.seal.fill", title: "도착", tint: SomewherePalette.success)
    }

    private var externalMapButton: some View {
        Button {
            store.requestExternalMap()
        } label: {
            Image(systemName: "map")
                .frame(width: 42, height: 42)
        }
        .buttonStyle(SomewhereSecondaryButtonStyle())
        .accessibilityLabel("외부 지도 열기")
        .accessibilityIdentifier("somewhere.external-map")
    }

    private var completionNote: some View {
        SomewhereCard(padding: 16) {
            Label("한 시간 뒤 이 장소가 어땠는지 한 번만 물어볼게요.", systemImage: "bell.badge")
                .font(.subheadline)
                .foregroundStyle(SomewherePalette.mutedInk)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}
