import SwiftUI

struct ConstraintView: View {
    @ObservedObject var store: JourneyStore
    @State private var category = "cafe"
    @State private var walkMinutes = 15
    @State private var budget = "medium"

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            Spacer()
            Text("어디로 갈지는\n도착할 때 알게 돼요.")
                .font(.largeTitle.weight(.semibold))
            Picker("종류", selection: $category) {
                Text("카페").tag("cafe")
                Text("식당").tag("restaurant")
            }
            .pickerStyle(.segmented)
            Stepper("걷기 \(walkMinutes)분", value: $walkMinutes, in: 5...60, step: 5)
            Picker("예산", selection: $budget) {
                Text("가볍게").tag("low")
                Text("보통").tag("medium")
                Text("여유롭게").tag("high")
            }
            Button("숨은 목적지 시작") {
                Task { await store.start(category: category, maxWalkMinutes: walkMinutes, budgetBand: budget) }
            }
            .buttonStyle(.borderedProminent)
            .frame(maxWidth: .infinity, minHeight: 44)
            .disabled(store.isWorking)
            .accessibilityLabel("숨은 목적지 여정 시작")
            Spacer()
        }
        .accessibilityLabel("여정 조건 선택")
    }
}
