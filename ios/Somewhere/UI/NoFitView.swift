import SwiftUI

struct NoFitView: View {
    @ObservedObject var store: JourneyStore

    var body: some View {
        VStack(spacing: 20) {
            SomewhereSignalPill(icon: "magnifyingglass", title: "아직 찾는 중", tint: SomewherePalette.accent)
            SomewhereCompass(mode: .paused, size: 96)
                .accessibilityIdentifier("somewhere.no-fit-compass")
            Text("조건에 맞는 한 곳을\n아직 찾지 못했어요")
                .font(.system(size: 29, weight: .bold, design: .serif))
                .foregroundStyle(SomewherePalette.ink)
                .multilineTextAlignment(.center)
            SomewhereCard(padding: 14) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("다시 확인할 조건")
                        .font(.subheadline.weight(.bold))
                    ForEach(store.noFitConditions) { issue in
                        Label(issue.title, systemImage: "circle.fill")
                            .font(.caption)
                            .foregroundStyle(SomewherePalette.mutedInk)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            Text("도보 시간이나 예산을 조금 넓히면 새로운 길이 열릴 수 있어요. 목적지 후보 목록은 보여드리지 않아요.")
                .font(.subheadline)
                .foregroundStyle(SomewherePalette.mutedInk)
                .multilineTextAlignment(.center)
            Button("조건 다시 보기") {
                store.reviewNoFit()
            }
            .buttonStyle(SomewherePrimaryButtonStyle())
            .accessibilityLabel("조건 다시 보기")
            .accessibilityIdentifier("somewhere.no-fit-review")
        }
        .padding(24)
    }
}
