import SwiftUI

struct ArrivalView: View {
    @ObservedObject var store: JourneyStore
    let projection: JourneyProjection

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 16) {
                HStack {
                    Button {
                        store.requestExternalMap()
                    } label: {
                        Image(systemName: "map")
                            .frame(width: 42, height: 42)
                    }
                    .buttonStyle(SomewhereSecondaryButtonStyle())
                    .accessibilityLabel("외부 지도 열기")
                    .accessibilityIdentifier("somewhere.external-map")
                    Spacer()
                    SomewhereSignalPill(icon: "checkmark.seal.fill", title: "ARRIVED", tint: SomewherePalette.success)
                }
                if projection.revealed == true {
                    RevealView(projection: projection)
                    SomewhereCard(padding: 16) {
                        Label("한 시간 뒤 이 장소가 어땠는지 한 번만 물어볼게요.", systemImage: "bell.badge")
                            .font(.subheadline)
                            .foregroundStyle(SomewherePalette.mutedInk)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                } else {
                    ProgressView()
                        .controlSize(.large)
                        .tint(SomewherePalette.accent)
                    Text("도착지를 공개하는 중이에요")
                        .font(.title3.weight(.bold))
                        .foregroundStyle(SomewherePalette.ink)
                }
            }
            .padding(.vertical, 8)
        }
        .task(id: projection.sequence) {
            if projection.revealed != true, projection.actions.contains(.reveal) {
                await store.reveal()
            }
        }
    }
}
