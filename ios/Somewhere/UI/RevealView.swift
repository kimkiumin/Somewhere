import SwiftUI

struct RevealView: View {
    let projection: JourneyProjection

    var body: some View {
        VStack(spacing: 16) {
            Text("도착했어요").font(.headline)
            Text(projection.reveal?.name ?? "목적지를 불러오는 중")
                .font(.largeTitle.weight(.semibold))
                .multilineTextAlignment(.center)
            if let address = projection.reveal?.address { Text(address).foregroundStyle(.secondary) }
        }
        .accessibilityLabel("공개된 목적지")
    }
}
