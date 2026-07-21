import SwiftUI

struct ContentView: View {
    @StateObject private var model = LocationHeadingModel()

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Sensor diagnostic")
                .font(.headline)
            Text("Authorization: \(String(describing: model.authorization))")
            Text("Latitude: \(model.location?.coordinate.latitude ?? -1, specifier: "%.6f")")
            Text("Longitude: \(model.location?.coordinate.longitude ?? -1, specifier: "%.6f")")
            Text("Accuracy: \(model.location?.horizontalAccuracy ?? -1, specifier: "%.1f") m")
            Text("Location timestamp: \(model.location?.timestamp.formatted() ?? "-")")
            Text("True heading: \(model.heading?.trueHeading ?? -1, specifier: "%.1f") degrees")
            Text("Magnetic heading: \(model.heading?.magneticHeading ?? -1, specifier: "%.1f") degrees")
            Text("Heading accuracy: \(model.heading?.headingAccuracy ?? -1, specifier: "%.1f") degrees")
            Text("Last update: \(model.lastUpdatedAt?.formatted() ?? "-")")
            if let errorMessage = model.errorMessage {
                Text("Diagnostic error: \(errorMessage)")
            }
            HStack {
                Button("Start sensor diagnostic") {
                    model.start()
                }
                Button("Stop") {
                    model.stop()
                }
                .disabled(!model.isUpdating)
            }
        }
        .padding()
        .onDisappear {
            model.stop()
        }
    }
}
